# ChatLogix Deployment Guide (Step-by-Step)

> **⚠️ Names below are historical.** This guide was written when there were 3 Lambda functions. Production has since moved to 5 functions with different names, and the AI Lambda now runs the new conversation-processor pipeline (docs/CONVERSATION_PROCESSOR_LAMBDA.md) instead of the multi-stage pipeline described here. Use this mapping when reading phases 7, 8, 12, 13, and the reference table below:
>
> | This guide calls it… | Live name today | Handler today |
> |---|---|---|
> | `chatlogix-webhook-handler` | `chatlogix-webhook-handler` (unchanged) | `dist/lambdas/handlers/webhookHandler.handler` |
> | `chatlogix-multi-stage-processor` | `chatlogix-incoming-response-generator` | `dist/lambdas/handlers/conversationProcessor.handler` (was `multiStageProcessor.handler`) — text queue only, audio/image triggers disabled |
> | `chatlogix-response-processor` | `chatlogix-whatsapp-response-dispatcher` | `dist/lambdas/handlers/responseProcessor.handler` (unchanged) |
>
> Two more functions exist that this guide never covered: `chatlogix-order-recovery` (EventBridge sweep, `dist/lambdas/handlers/orderRecovery.handler`) and `chatlogix-media-fetcher` (not functional — no handler code exists yet; audio/image is a deliberately deferred gap, see `backend/src/lambdas/README.md`). The infrastructure steps below (IAM, S3, SQS, VPC) are still accurate as a one-time setup reference — only the Lambda **names and handlers** have drifted.

This guide is written for someone who is **not** a DevOps engineer. Every step tells you exactly which page to open, what to click, and what to type. Follow the phases in order — do not skip ahead.

**What you'll have at the end:**
- 3 AWS Lambda functions running your AI workers (`response-processor`, `webhook-handler`, `multi-stage-processor`)
- 1 API Gateway URL for the WhatsApp webhook
- 9 SQS queues: 4 main (text/audio/image/response) + 4 DLQs + 1 media-fetch
- Bitbucket Pipelines that auto-deploy to your Lightsail VM and Lambdas on every push to `master`

**What you already have (keep using):**
- Lightsail VM with the Express API + frontend + PostgreSQL — no changes needed
- WhatsApp Business API access

**Region used in this guide:** `ap-south-1` (Mumbai). Every screenshot URL and resource name uses this. If you ever switch region, redo every phase.

**Time estimate:** 3–4 hours for first-time setup.

---

## Phase 0 — Before You Start

You need:
1. AWS Console access (root or admin user) at https://console.aws.amazon.com
2. Bitbucket repo admin access
3. SSH access to your Lightsail VM (you already have this)
4. Your Lightsail VM's **public IP** and **private IP** — write them down now:
   - Public IP: `_______________` (e.g. `13.233.92.128`)
   - Private IP: `_______________` (find this in Lightsail Console → your instance → Networking tab → "Private IP")
5. Your existing `.env` file from the Lightsail VM (run `cat /home/bitnami/chatlogix/backend/.env` on the VM and save it locally — you'll copy values out of it).
6. A text file open where you can paste IDs/ARNs/URLs as you create them. You'll be copying things between phases.

**Set the AWS Console region first:** in the top-right of the AWS Console, click the region dropdown and choose **Asia Pacific (Mumbai) ap-south-1**. Every Console page must show this region in the URL/header before you click anything.

---

## Phase 1 — Create a Deployment IAM User

This user's keys go into Bitbucket so the pipeline can push code to AWS. We do **not** use your root account for this.

### Steps

1. Open https://console.aws.amazon.com/iam/
2. Left sidebar → **Users** → click **Create user** (top-right, orange button)
3. **User name:** `chatlogix-deployer` → click **Next**
4. **Permissions options:** select **Attach policies directly**
5. In the search box, search and tick each of these (one at a time):
   - `AmazonS3FullAccess`
   - `AmazonSQSFullAccess`
   - `AWSLambda_FullAccess`
   - `IAMReadOnlyAccess`
   - `CloudWatchLogsFullAccess`
6. Click **Next** → **Create user**
7. You're back on the Users list. Click the new user **`chatlogix-deployer`**.
8. Tab **Security credentials** → scroll to **Access keys** → click **Create access key**
9. **Use case:** select **Application running outside AWS** → **Next**
10. **Description tag:** type `bitbucket-pipelines` → **Create access key**
11. **CRITICAL:** copy both values into your text file now. You will never see the secret again.
    - Access key ID: `AKIA...` → save as `AWS_ACCESS_KEY_ID`
    - Secret access key: `xxxxxxxxxxxx` → save as `AWS_SECRET_ACCESS_KEY`
12. Click **Done**.

**Verify:** the user appears in IAM → Users with one access key listed.

---

## Phase 2 — Create the S3 Bucket for Lambda Code

Bitbucket will upload zipped Lambda code here, and AWS Lambda will pull from here.

### Steps

1. Open https://s3.console.aws.amazon.com/s3/
2. Top-right region dropdown must show **Asia Pacific (Mumbai)**.
3. Click **Create bucket** (orange button).
4. **Bucket name:** `ap-south-1-chatlogix-lambda-deployments-prod`
   (must be exactly this — global unique name; if it's taken, append your initials like `-mk`)
5. **AWS Region:** Asia Pacific (Mumbai) ap-south-1
6. **Object Ownership:** ACLs disabled (recommended) — leave default
7. **Block Public Access settings:** all four boxes checked ✅ (leave default)
8. **Bucket Versioning:** click **Enable** (so we have rollback)
9. **Default encryption:** Server-side encryption with Amazon S3 managed keys (SSE-S3) — leave default
10. Scroll down → **Create bucket**

**Verify:** the bucket appears in the list. Save the bucket name in your text file as `LAMBDA_S3_BUCKET`.

---

## Phase 3 — Create the SQS Queues

The code expects 4 main queues that handle messages between the API, AI pipeline, and WhatsApp. Each gets a "dead-letter queue" (DLQ) for messages that failed 3 times — this prevents infinite retry loops.

You'll create **8 queues in Phase 3.1 + 3.2**: 4 main + 4 DLQs. Create the DLQs first because the main queue needs to point to them. Then Phase 3.3 adds one more queue (`chatlogix-media-fetch-queue-prod`) for the media worker — that one has no DLQ because it manages its own retries.

**Total at end of Phase 3: 9 queues.**

### Step 3.1 — Create the 4 Dead-Letter Queues

For each name in this list, repeat the steps below:
- `chatlogix-response-dlq-prod`
- `chatlogix-text-dlq-prod`
- `chatlogix-audio-dlq-prod`
- `chatlogix-image-dlq-prod`

1. Open https://ap-south-1.console.aws.amazon.com/sqs/
2. Click **Create queue**.
3. **Type:** Standard (default) — leave selected.
4. **Name:** paste the DLQ name (e.g. `chatlogix-response-dlq-prod`)
5. Leave every other setting at default.
6. Scroll to the bottom → **Create queue**.
7. On the queue page that opens, **copy the URL** (top of page, "URL" field). Paste it into your text file labeled with the queue name. You won't need DLQ URLs in env vars, but keep them anyway.

Repeat for all 4 DLQs.

### Step 3.2 — Create the 4 Main Queues

For each name, repeat:
- `chatlogix-response-queue-prod`  → DLQ = `chatlogix-response-dlq-prod`
- `chatlogix-text-queue-prod`      → DLQ = `chatlogix-text-dlq-prod`
- `chatlogix-audio-queue-prod`     → DLQ = `chatlogix-audio-dlq-prod`
- `chatlogix-image-queue-prod`     → DLQ = `chatlogix-image-dlq-prod`

1. SQS Console → **Create queue**
2. **Type:** Standard
3. **Name:** paste main queue name
4. Scroll up to **Configuration** section. For `chatlogix-text-queue-prod`, `chatlogix-audio-queue-prod`, and `chatlogix-image-queue-prod` ONLY:
   - **Visibility timeout:** change from default `30 seconds` to **`30 minutes`** (= 1800 seconds).
   - This is required because these queues trigger the `chatlogix-multi-stage-processor` Lambda whose timeout is 300 seconds. SQS requires the queue's visibility timeout to be ≥ Lambda timeout, and AWS recommends 6× (so 1800s). If you skip this, adding the Lambda trigger in Phase 7.4 will fail with the error *"Queue visibility timeout: 30 seconds is less than Function timeout: 300 seconds"*.
   - For `chatlogix-response-queue-prod`, leave the default 30s — its Lambda timeout is only 60s, so the default is fine.
5. Scroll down to **Dead-letter queue** section → expand it → toggle **Enabled** ON
6. **Choose queue:** click the dropdown, pick the matching DLQ from Step 3.1
7. **Maximum receives:** type `3`
8. Scroll down → **Create queue**
9. **Copy the queue URL** (looks like `https://sqs.ap-south-1.amazonaws.com/123456789012/chatlogix-response-queue-prod`). Save in your text file under matching env var name:

| Queue | Env var name |
|---|---|
| `chatlogix-response-queue-prod` | `RESPONSE_QUEUE_URL` |
| `chatlogix-text-queue-prod` | `TEXT_QUEUE_URL` |
| `chatlogix-audio-queue-prod` | `AUDIO_QUEUE_URL` |
| `chatlogix-image-queue-prod` | `IMAGE_QUEUE_URL` |

**Verify:** all 8 queues are listed in SQS Console.

### Step 3.3 — Create the Media-Fetch Queue (no DLQ)

The media worker on Lightsail fetches WhatsApp audio/image bytes and uploads them to S3. It has its own retry mechanism (backoff via `DelaySeconds`) and tracks terminal failures in the database, so it does **not** use a DLQ.

1. SQS Console → **Create queue**
2. **Type:** Standard
3. **Name:** `chatlogix-media-fetch-queue-prod`
4. Skip the Dead-letter queue section (leave **Disabled**).
5. Scroll down → **Create queue**
6. Copy the URL and save it as `MEDIA_FETCH_QUEUE_URL` in your text file.

**Verify:** the SQS Console now lists 9 queues total (8 from 3.1/3.2 + this one).

### How the 5 main queues fit together

```
                    WhatsApp Business API
                            │
              (webhook POST: text / audio / image)
                            │
                            ▼
                  chatlogix-webhook-handler (Lambda)
                            │
       ┌────────────────────┼────────────────────┐
       │                    │                    │
   text/interactive     audio / image       (media types)
       │                    │                    │
       ▼                    ▼                    ▼
   chatlogix-          chatlogix-           chatlogix-
   text-queue-prod     media-fetch-         text-queue-prod
                       queue-prod           (skipped — only
                            │                non-text drops here
                            ▼                if it ever does)
                   chatlogix-media-worker
                   (PM2 on Lightsail)
                   • Downloads bytes from WhatsApp CDN
                   • Uploads to S3 (WA_MEDIA_S3_BUCKET)
                   • If audio: Whisper transcribe → publish
                   • If image with caption: publish caption
                   • If image without caption: templated reply
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
   chatlogix-audio-  chatlogix-image-  chatlogix-response-
   queue-prod        queue-prod        queue-prod
            │               │               │
            └───────┬───────┘               │
                    ▼                       │
        chatlogix-multi-stage-processor    │
        (Lambda — three SQS triggers)      │
        Runs the 14-stage AI pipeline      │
        and publishes the reply ───────────┘
                                            ▼
                              chatlogix-response-processor (Lambda)
                                            │
                                            ▼
                                  WhatsApp Business API
                                  (send reply to customer)
```

**Key things to remember:**
- The **media worker stays on Lightsail** even if you go Lambda-only for AI. It needs `OPENAI_API_KEY` for Whisper transcription.
- Audio is **transcribed**, not analyzed. The AI sees plain text.
- Image is **caption-only**. The image bytes stay in S3; only the caption text goes to the AI. Captionless images get a hardcoded English reply ("I see you sent a photo. Could you tell me what you'd like help with?") — no AI call.
- All four AI-feeder queues (`text`, `audio`, `image`, `response`) have DLQs. `media-fetch-queue` retries itself with exponential backoff and tracks terminal failures in the database, so it has no DLQ.

---


---

## Phase 4 — Make Your Lightsail PostgreSQL Reachable from Lambda

Your Postgres lives on the Lightsail VM. AWS Lambda runs in AWS's network. To connect them safely we use **Lightsail VPC peering** — one click that links Lightsail's network to your AWS account's default VPC.

### Step 4.1 — Enable Lightsail VPC peering

1. Open https://lightsail.aws.amazon.com/
2. Top-right **Account dropdown** → **Account**
3. Tab **Advanced**
4. Find **VPC peering** section → next to **Asia Pacific (Mumbai)** → click **Enable**
5. Wait ~30 seconds for the toggle to turn green/checked.

### Step 4.2 — Find your Lightsail VM's private IP and CIDR

1. Lightsail Console → click your VM (the one running ChatLogix)
2. Tab **Networking** → note the **Private IP** (e.g. `172.26.5.123`). Save in text file as `DB_PRIVATE_IP`.
3. The Lightsail VPC CIDR is always `172.26.0.0/16` for ap-south-1. Save as `LIGHTSAIL_CIDR`.

### Step 4.3 — Allow Postgres connections from AWS VPC

SSH into your Lightsail VM:

```bash
ssh bitnami@<YOUR_LIGHTSAIL_PUBLIC_IP>
```

Then:

1. Edit Postgres config to listen on private IP:
   ```bash
   sudo nano /etc/postgresql/15/main/postgresql.conf
   ```
   (Use whatever version your Postgres is — `ls /etc/postgresql/` to check.)

   Find the line `#listen_addresses = 'localhost'` and change it to:
   ```
   listen_addresses = '*'
   ```
   Save: `Ctrl+O`, `Enter`, `Ctrl+X`.

2. Allow connections from the AWS default VPC CIDR (will be added in Phase 6):
   ```bash
   sudo nano /etc/postgresql/15/main/pg_hba.conf
   ```
   Scroll to the bottom, add a new line:
   ```
   host    all    all    172.31.0.0/16    md5
   ```
   (`172.31.0.0/16` is the default VPC CIDR for new AWS accounts in ap-south-1. Confirm in Phase 5.)

   Save and exit.

3. Restart Postgres:
   ```bash
   sudo systemctl restart postgresql
   ```

4. Open the Lightsail firewall to allow port 5432 from peered AWS VPC:
   - Lightsail Console → your instance → tab **Networking**
   - Scroll to **IPv4 Firewall** → click **+ Add rule**
   - Application: **Custom**, Protocol: **TCP**, Port: **5432**
   - Click **Restrict to IP address** → enter `172.31.0.0/16`
   - Click **Create**

### Step 4.4 — Save the Lambda DATABASE_URL

In your text file, write the connection string Lambda will use (using **private IP**, not localhost):

```
DATABASE_URL=postgresql://<DB_USER>:<DB_PASSWORD>@<DB_PRIVATE_IP>:5432/<DB_NAME>?schema=public
```

Replace the `<…>` parts with the values from your existing `.env`. Keep this for Phase 6.

---

## Phase 5 — Note Your Default VPC Details

Lambda needs to know which VPC subnets to run in.

### Steps

1. Open https://ap-south-1.console.aws.amazon.com/vpc/home
2. Left sidebar → **Your VPCs**
3. There's one VPC marked "default" with a CIDR like `172.31.0.0/16`. Click it.
4. Note the **VPC ID** (`vpc-xxxxxxxx`). Save as `DEFAULT_VPC_ID`.
5. Left sidebar → **Subnets**. You'll see 3 subnets in the default VPC, each in a different Availability Zone (ap-south-1a, 1b, 1c). Note all 3 **Subnet IDs** (`subnet-xxxxxxxx`). Save as `LAMBDA_SUBNET_IDS`.
6. Left sidebar → **Security groups**. Find the default group for the default VPC.

### Step 5.1 — Create a security group for Lambda

1. Top-right → **Create security group**
2. **Name:** `chatlogix-lambda-sg`
3. **Description:** `Security group for ChatLogix Lambda functions`
4. **VPC:** pick the default VPC
5. **Outbound rules:** by default it allows all outbound — leave it. Lambda needs outbound to OpenAI, WhatsApp, and Postgres (5432).
6. **Inbound rules:** none needed.
7. Tags: skip.
8. **Create security group**.
9. Save the new SG ID as `LAMBDA_SECURITY_GROUP_ID`.

---

## Phase 6 — Create the Lambda Execution Role

This is an IAM role the Lambda functions assume at runtime so they can read SQS and write logs.

### Steps

1. Open https://console.aws.amazon.com/iam/ → **Roles** → **Create role**
2. **Trusted entity type:** AWS service
3. **Use case:** Lambda → **Next**
4. Search and tick:
   - `AWSLambdaBasicExecutionRole` (CloudWatch Logs)
   - `AWSLambdaSQSQueueExecutionRole` (read from SQS)
   - `AWSLambdaVPCAccessExecutionRole` (run inside VPC — required since DB is in VPC)
   - `AmazonSQSFullAccess` (write to other queues)
5. Click **Next**.
6. **Role name:** `chatlogix-lambda-execution-role`
7. **Description:** `Execution role for ChatLogix Lambda functions`
8. **Create role**.
9. Click the new role to open it. Copy the **ARN** at the top (e.g. `arn:aws:iam::123456789012:role/chatlogix-lambda-execution-role`). Save as `LAMBDA_ROLE_ARN`.

---

## Phase 7 — Create the 3 Lambda Functions

We will create 3 functions — the ones whose handler files actually exist in this repo today:
- `chatlogix-response-processor` — sends WhatsApp replies (triggered by SQS)
- `chatlogix-webhook-handler` — receives WhatsApp webhook (triggered by API Gateway)
- `chatlogix-multi-stage-processor` — full AI pipeline (triggered by SQS)

For each function, repeat **Step 7.1 → Step 7.4**.

### Function settings table

| Function name | Memory | Timeout | Trigger queue(s) |
|---|---|---|---|
| `chatlogix-response-processor` | 512 MB | 60 s | `chatlogix-response-queue-prod` |
| `chatlogix-webhook-handler` | 256 MB | 30 s | (none — API Gateway in Phase 8) |
| `chatlogix-multi-stage-processor` | 2048 MB | 300 s | `chatlogix-text-queue-prod`, `chatlogix-audio-queue-prod`, `chatlogix-image-queue-prod` (three triggers) |

### Step 7.1 — Create the function

1. Open https://ap-south-1.console.aws.amazon.com/lambda/
2. **Create function** → **Author from scratch**
3. **Function name:** type the name from the table (start with `chatlogix-response-processor`)
4. **Runtime:** Node.js 18.x
5. **Architecture:** x86_64 (default)
6. **Permissions** → expand → **Use an existing role** → pick `chatlogix-lambda-execution-role`
7. **Advanced settings** → expand:
   - **Enable VPC** ✅
   - **VPC:** pick the default VPC (`DEFAULT_VPC_ID`)
   - **Subnets:** select all 3 (`LAMBDA_SUBNET_IDS`)
   - **Security groups:** pick `chatlogix-lambda-sg` (`LAMBDA_SECURITY_GROUP_ID`)
8. Click **Create function**. Wait ~30 seconds.

### Step 7.2 — Set memory, timeout, and handler

1. On the function page, tab **Configuration** → left side **General configuration** → **Edit**.
2. **Memory:** value from the table (e.g. `512`).
3. **Timeout:** value from the table (e.g. `1 min` for 60s, `5 min` for 300s).
4. **Save**.
5. Tab **Code** → scroll to **Runtime settings** (below the editor) → **Edit**:
   - **Handler:** for each function, set:
     - `chatlogix-response-processor` → `dist/lambdas/handlers/responseProcessor.handler`
     - `chatlogix-webhook-handler` → `dist/lambdas/handlers/webhookHandler.handler`
     - `chatlogix-multi-stage-processor` → `dist/lambdas/handlers/multiStageProcessor.handler`
6. **Save**.

### Step 7.3 — Add environment variables

1. Tab **Configuration** → left side **Environment variables** → **Edit** → **Add environment variable** for each row.
2. Add the following keys with values from your text file / existing `.env`:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the one from Phase 4.4 (uses **private IP**, not localhost) |
| `AWS_REGION` | `ap-south-1` |
| `OPENAI_API_KEY` | from your existing `.env` |
| `WHATSAPP_ACCESS_TOKEN` | from existing `.env` |
| `WHATSAPP_PHONE_NUMBER_ID` | from existing `.env` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | from existing `.env` |
| `RESPONSE_QUEUE_URL` | from Phase 3.2 |
| `TEXT_QUEUE_URL` | from Phase 3.2 |
| `AUDIO_QUEUE_URL` | from Phase 3.2 |
| `IMAGE_QUEUE_URL` | from Phase 3.2 |
| `MEDIA_FETCH_QUEUE_URL` | from Phase 3.3 |
| `LOG_LEVEL` | `info` |
| `ENABLE_MULTI_STAGE_AI` | `true` |
| `MULTI_STAGE_AI_ROLLOUT_PERCENTAGE` | `100` |

3. **Save**.

### Step 7.4 — Add SQS triggers (skip for `chatlogix-webhook-handler`)

For `chatlogix-response-processor`: add **one** trigger.

For `chatlogix-multi-stage-processor`: add **three** triggers — one for each of the text/audio/image input queues. The Lambda handler treats all three the same (audio and image have already been transcribed/captioned by the media worker by the time they land in their queues).

For each trigger:

1. Function page → **+ Add trigger** (top of the diagram).
2. **Source:** SQS.
3. **SQS queue:** pick the matching queue from this table:

   | Lambda | Queues to add as triggers |
   |---|---|
   | `chatlogix-response-processor` | `chatlogix-response-queue-prod` |
   | `chatlogix-multi-stage-processor` | `chatlogix-text-queue-prod`, `chatlogix-audio-queue-prod`, `chatlogix-image-queue-prod` (repeat the trigger flow three times) |

4. **Batch size:** 5 (good default — Lambda processes up to 5 messages per invocation).
5. **Activate trigger:** ✅ ticked.
6. **Add**.

**If you see *"Queue visibility timeout: 30 seconds is less than Function timeout: 300 seconds"*:** the queue's visibility timeout wasn't set to 1800s in Phase 3.2 step 4. Go back to SQS Console → the offending queue → **Edit** → set **Visibility timeout** to `30 minutes`, save, then retry the trigger.

**IMPORTANT:** The Lambda has no code yet, so it will fail on real messages. That's fine — Bitbucket will deploy code in Phase 11. For now, leave the triggers active but **don't send real WhatsApp traffic yet** (we'll re-point the webhook in Phase 8).

Repeat Steps 7.1–7.4 for all 3 functions. Verify in the Lambda Console you see all 3.

---

## Phase 8 — Create the API Gateway Webhook URL

WhatsApp needs an HTTPS URL to send incoming messages to. API Gateway gives us one for free, and routes traffic into the `chatlogix-webhook-handler` Lambda.

### Steps

1. Open https://ap-south-1.console.aws.amazon.com/apigateway/
2. Click **Create API**.
3. Find **HTTP API** card → **Build** (not REST API).
4. **Integrations:** click **Add integration** → **Lambda** → in the dropdown, pick `chatlogix-webhook-handler`.
5. **API name:** `chatlogix-webhook` → **Next**.
6. **Configure routes:**
   - First route: **Method:** `GET`, **Resource path:** `/webhook`, **Integration target:** `chatlogix-webhook-handler` (auto-filled).
   - Click **Add route** → **Method:** `POST`, **Resource path:** `/webhook`, **Integration target:** `chatlogix-webhook-handler`.
   - **Next**.
7. **Stages:** keep `$default`, **Auto-deploy** ✅. **Next**.
8. **Review and create** → **Create**.
9. On the API summary page, note the **Invoke URL** at the top (e.g. `https://abc123xyz.execute-api.ap-south-1.amazonaws.com`). Save as `API_GATEWAY_URL`. Your full webhook URL is `<API_GATEWAY_URL>/webhook`.

**Don't update WhatsApp yet** — wait until Phase 11 when code is deployed.

---

## Phase 9 — Set Up Bitbucket SSH Access to Lightsail

Bitbucket Pipelines needs to SSH into your Lightsail VM to deploy backend/frontend code. We'll create a dedicated SSH key just for the pipeline.

### Step 9.1 — Generate an SSH key in Bitbucket

1. Open Bitbucket → your repo → left sidebar **Repository settings**.
2. **PIPELINES** section → **SSH keys**.
3. Click **Generate keys**. Bitbucket creates a key pair and shows the public key.
4. Copy the **Public key** (starts with `ssh-rsa AAAA...`). Save in your text file as `PIPELINE_PUBLIC_KEY`.

### Step 9.2 — Add the public key to Lightsail VM

SSH into your Lightsail VM:
```bash
ssh bitnami@<YOUR_LIGHTSAIL_PUBLIC_IP>
```

Append the pipeline's public key to authorized_keys:
```bash
echo "PASTE_PIPELINE_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

(Replace the placeholder with the actual key from Step 9.1.)

### Step 9.3 — Tell Bitbucket the host fingerprint

Back in Bitbucket → Repository settings → **SSH keys** page:

1. Scroll to **Known hosts** section.
2. **Host address:** type your Lightsail public IP (e.g. `13.233.92.128`).
3. Click **Fetch**. Bitbucket connects, fetches the fingerprint, and shows it.
4. Click **Add host**.

**Verify:** the host appears in the "Known hosts" list.

---

## Phase 10 — Add Bitbucket Repository Variables

These are the secrets and config the pipeline file references. Without them the pipeline can't authenticate.

### Steps

1. Bitbucket repo → **Repository settings** → left sidebar **PIPELINES** section → **Repository variables**.
2. For each row in the table below, click **Add**, fill in name and value, tick **Secured** for sensitive ones, then **Add**:

| Name | Value | Secured? |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | from Phase 1.11 | ✅ |
| `AWS_SECRET_ACCESS_KEY` | from Phase 1.11 | ✅ |
| `AWS_DEFAULT_REGION` | `ap-south-1` | ❌ |
| `LAMBDA_S3_BUCKET` | `ap-south-1-chatlogix-lambda-deployments-prod` | ❌ |
| `EC2_HOST` | your Lightsail public IP | ❌ |
| `EC2_USER` | `bitnami` | ❌ |

**Verify:** all 6 variables show in the list.

### Step 10.1 — Enable Pipelines

1. Repository settings → **PIPELINES** → **Settings**.
2. Toggle **Enable Pipelines** ON. Save.

---

## Phase 11 — Push the Pipeline File and Deploy

The repo already has a `bitbucket-pipelines.yml` at the root (we created it earlier in this conversation).

### Step 11.1 — Commit and push

On your local machine:

```bash
cd c:\Projects\chat-logix
git add bitbucket-pipelines.yml docs/DEPLOYMENT.md
git commit -m "Add Bitbucket Pipelines and deployment guide"
git push origin master
```

### Step 11.2 — Watch the pipeline run

1. Bitbucket repo → left sidebar **Pipelines**.
2. You'll see a new pipeline running. Click into it.
3. Steps run in order:
   - **Build backend** (~3 min) — runs `npm ci`, `prisma generate`, `tsc`.
   - **Build frontend** (parallel, ~3 min) — runs `npm ci`, `vite build`.
   - **Deploy Lambda functions** (~2 min) — zips each handler, uploads to S3, calls `aws lambda update-function-code`.
   - **Deploy API + workers to EC2** (~5 min) — SSHes into Lightsail, pulls code, builds, runs `pm2 reload`.
4. Each step has a green ✅ when it succeeds, red ✗ when it fails. Click into a step to see logs.

**If any step fails:** read the log line by line. The most common issues:
- **"Bucket does not exist"** → the bucket name in `LAMBDA_S3_BUCKET` doesn't match Phase 2.
- **"Permission denied (publickey)"** → SSH key not on Lightsail (Phase 9.2) or the public IP changed.
- **"Function not found"** → Lambda function name doesn't match what's in `bitbucket-pipelines.yml`.
- **"Unzipped size must be smaller than 262144000 bytes"** → the Lambda zip expanded past AWS's 250 MB limit. Deploy now slims the package via `backend/scripts/package-lambda.sh`; do not zip raw `node_modules`.
- **"prisma migrate deploy" error** → DATABASE_URL on EC2 wrong; SSH in and check `cat backend/.env`.

### Step 11.3 — Verify deployment

After all 4 steps go green:

1. **API still running:**
   ```bash
   curl http://<YOUR_LIGHTSAIL_PUBLIC_IP>/api/health
   ```
   Should return `{"ok":true}` or similar.

2. **Lambdas have code:**
   - Lambda Console → click `chatlogix-response-processor` → tab **Code** → you should see the file tree (no longer empty).
   - Tab **Test** → **Create new test event** → template "SQS" → **Test** → should run without "module not found".

3. **PM2 processes still healthy:** SSH to Lightsail → `pm2 status`. All 5 processes (`chatlogix-backend`, 4 workers) must be `online`.

---

## Phase 12 — Point WhatsApp Webhook to API Gateway

Only do this once Phase 11 is green and the webhook Lambda has code.

### Steps

1. Open https://business.facebook.com/ → **Business Settings** → **WhatsApp Accounts** → your number → **Configuration** tab → **Webhook**.
2. Click **Edit**.
3. **Callback URL:** paste `<API_GATEWAY_URL>/webhook` from Phase 8.9 (e.g. `https://abc123xyz.execute-api.ap-south-1.amazonaws.com/webhook`).
4. **Verify token:** the value of `WHATSAPP_WEBHOOK_VERIFY_TOKEN` from your `.env`.
5. Click **Verify and save**. WhatsApp sends a `GET /webhook` to your API Gateway → Lambda → it should reply with the challenge.

**If verification fails:**
- Check Lambda CloudWatch logs (Lambda Console → `chatlogix-webhook-handler` → **Monitor** tab → **View logs in CloudWatch**).
- Common cause: `WHATSAPP_WEBHOOK_VERIFY_TOKEN` env var on the Lambda doesn't match what you typed in Meta.

### After verification

WhatsApp now sends incoming messages to **API Gateway → Lambda → SQS**, and SQS triggers the **multi-stage processor Lambda**. Your Lightsail PM2 workers no longer need to handle these messages — see Phase 13 for cleanup.

### Step 12.1 — Send three test messages

From your phone (or anyone's), message your WhatsApp Business number:

1. **A plain text message:** e.g. *"hello"*.
   - Watch CloudWatch logs for `chatlogix-multi-stage-processor` (Lambda Console → **Monitor** → **View logs**). You should see a batch processed within ~10s.
   - You should get an AI reply on WhatsApp.

2. **A voice note:** record a short message (2–5 seconds), send it.
   - Watch `chatlogix-media-worker` logs on Lightsail (`pm2 logs chatlogix-media-worker --lines 50`). You should see: "Downloading media bytes" → "Uploading to S3" → "Whisper transcription complete" → "Audio handed off to AUDIO_QUEUE_URL".
   - Then the multi-stage Lambda logs should show the transcript as input. AI reply lands on WhatsApp.

3. **A photo with a caption:** send any image and type a caption like *"is this in stock?"*.
   - Media worker logs: "Image handed off to IMAGE_QUEUE_URL".
   - Multi-stage Lambda processes the caption as text.

4. **A photo without a caption:** send any image with no caption.
   - Media worker logs: "Image has no caption; sending templated reply".
   - You get the templated reply *"I see you sent a photo. Could you tell me what you'd like help with?"* on WhatsApp **without** the multi-stage Lambda being invoked (cost-saving by design).

If any step fails: check the queue's message count in SQS Console (a non-zero "Messages available" while no Lambda is firing means the trigger is misconfigured or the queue's visibility timeout is wrong — see Phase 3.2 step 4 and Phase 7.4 troubleshooting).

---

## Phase 13 — Decide: Lambda OR PM2 Workers (Not Both)

**Critical:** Right now both Lightsail PM2 workers AND the new Lambdas are subscribed to the same SQS queues. Every message will be processed twice. You must pick one.

### Option A: Use Lambdas, stop the PM2 workers (recommended for scaling)

SSH into Lightsail:
```bash
pm2 stop chatlogix-multi-stage-ai-worker
pm2 stop chatlogix-response-worker
pm2 stop chatlogix-incoming-worker
pm2 save
```

Keep `chatlogix-backend` (the API) and `chatlogix-media-worker` running on Lightsail.

**Important — media worker requirements on Lightsail:** the media worker is the only piece that *must* stay on Lightsail (it pulls bytes from WhatsApp's CDN and uploads to S3). For audio transcription it now also calls OpenAI Whisper, so make sure these env vars are set in `/home/bitnami/chatlogix/backend/.env`:

| Env var | Why |
|---|---|
| `OPENAI_API_KEY` | Whisper API for voice-note transcription |
| `WHATSAPP_ACCESS_TOKEN` | Download media bytes from Meta CDN |
| `WA_MEDIA_S3_BUCKET` | Bucket where downloaded bytes are stored |
| `WA_MEDIA_S3_REGION` | (Optional) defaults to `AWS_REGION` |
| `MEDIA_FETCH_QUEUE_URL` | Queue it consumes from |
| `AUDIO_QUEUE_URL` | Queue it publishes transcripts to |
| `IMAGE_QUEUE_URL` | Queue it publishes image captions to |
| `RESPONSE_QUEUE_URL` | Queue it publishes templated replies to (e.g. no-caption images) |

After updating `.env`, restart: `pm2 restart chatlogix-media-worker`.

### Option B: Use PM2 workers, disable Lambda triggers

1. Lambda Console → each function → tab **Configuration** → **Triggers** → click the SQS trigger → **Disable**.
2. Skip Phase 12 (don't point WhatsApp at API Gateway). Keep webhook pointed at Lightsail's `https://your-domain/api/webhook`.

**Recommendation:** Option A. Lambdas auto-scale and you stop paying for idle Lightsail workers.

---

## Phase 14 — Ongoing: Future Deployments

Now that the pipeline is set up, future deployments are just:

```bash
git add <files>
git commit -m "your message"
git push origin master
```

Bitbucket will automatically:
1. Run the build
2. Update Lambda code
3. SSH into Lightsail and reload the API + frontend

**Pull request workflow:** when you open a PR (any branch except master), Bitbucket only runs the **build** steps — not the deploy. So you catch failures before merge. After merge to master, full deploy runs.

---

## Troubleshooting

### "I pushed but Bitbucket didn't run anything"

- Repository settings → Pipelines → Settings → check **Enable Pipelines** is ON.
- Make sure `bitbucket-pipelines.yml` is at the **root** of the repo (not in a subfolder).

### Pipeline step "Deploy Lambda" fails with "AccessDenied"

The IAM user from Phase 1 is missing a permission. Re-check Phase 1 step 5 — all 5 policies attached.

### Pipeline step "Deploy to EC2" hangs

Lightsail VM may have rebooted and got a new SSH host fingerprint. Redo Phase 9.3 (Known hosts → fetch).

### Lambda runs but errors with "Cannot connect to database"

- Lambda → Configuration → VPC → subnets correct (Phase 7.1)?
- `DATABASE_URL` uses **private IP** of Lightsail, not `localhost` and not the public IP?
- Lightsail VPC peering enabled (Phase 4.1)?
- Postgres `pg_hba.conf` allows `172.31.0.0/16` (Phase 4.3)?
- Test from Lambda console: `Test` → simple event → check the error message in CloudWatch Logs.

### Lambda runs but errors with "Cannot find module './handler'"

The handler path in **Runtime settings** (Phase 7.2) doesn't match the file in the zip. The bitbucket-pipelines.yml zips from `backend/` so handler paths must start with `dist/lambdas/handlers/...`.

### WhatsApp webhook verification fails

Check CloudWatch logs for `chatlogix-webhook-handler`. The Lambda code expects to read the verify token from the env var; if it's not set, verification fails silently.

### PM2 reload fails

SSH to Lightsail, run `pm2 logs --lines 50`. Most likely cause: backend build failed (TypeScript error) and `pm2 reload` rolled back. Run `cd /home/bitnami/chatlogix/backend && npm run build` manually to see the error.

### "I want to roll back a bad deployment"

Lambda: Lambda Console → function → **Versions** tab → previous version → **Use this version**.
EC2: SSH in → `cd /home/bitnami/chatlogix && git log --oneline -5` → `git reset --hard <previous_commit>` → `cd backend && npm run build && cd .. && pm2 reload ecosystem.config.js`.

### "How much will this cost per month?"

Rough estimate (low traffic, ~1000 messages/day, mostly text):
- Lightsail VM: $20/mo (already paying)
- Lambda: $0–$2/mo (1M free invocations + you're under)
- API Gateway: $0–$1/mo (1M free)
- SQS: $0 (1M free)
- S3: <$0.10/mo (Lambda zips + WhatsApp media at ~50 KB/audio, ~200 KB/image)
- VPC/data transfer: <$1/mo
- **OpenAI Whisper:** $0.006/min of audio. If 5% of your 1000 messages/day are voice notes averaging 10 seconds, that's ~50 voice notes × ~10s × $0.0001/s = **~$0.05/day = ~$1.50/mo**. Scales linearly with voice-note volume — a power user sending lots of 30s notes will dominate this line.
- **Total added on top of Lightsail: ~$3–$7/mo**

Cost knobs to keep in mind:
- Audio messages cost ~6× a text message (Whisper + AI pipeline). The legacy `BILLING_AUDIO_CREDIT=3` already prices them higher to customers.
- Captionless images cost **$0** in AI (templated reply bypasses the pipeline by design). Captioned images cost the same as text.
- If Whisper volume becomes a concern, you can disable audio AI routing by removing `AUDIO_QUEUE_URL` from the media worker's `.env` — voice notes will then be stored to S3 but never transcribed or replied to.

---

## Reference: What's in Each Resource

| Resource | Purpose |
|---|---|
| **IAM user `chatlogix-deployer`** | Bitbucket pipeline credentials |
| **IAM role `chatlogix-lambda-execution-role`** | What each Lambda runs as |
| **S3 bucket `ap-south-1-chatlogix-lambda-deployments-prod`** | Stores zipped Lambda code |
| **SQS `chatlogix-response-queue-prod`** | Outgoing WhatsApp messages |
| **SQS `chatlogix-text-queue-prod`** | Incoming text messages → AI pipeline |
| **SQS `chatlogix-audio-queue-prod`** | Audio messages after Whisper transcription → AI pipeline |
| **SQS `chatlogix-image-queue-prod`** | Image messages with caption → AI pipeline |
| **SQS `chatlogix-media-fetch-queue-prod`** | Media download/transcribe jobs (consumed by media worker on Lightsail) — **not currently created**; `.env`'s `MEDIA_FETCH_QUEUE_URL` points at a queue that doesn't exist in the account, and the webhook Lambda doesn't route audio/image anywhere yet. Part of the deferred audio/image gap. |
| **Lambda `chatlogix-webhook-handler`** | Receives webhook, drops to SQS |
| **Lambda `chatlogix-incoming-response-generator`** | Full AI reply generation — runs `conversationProcessor.handler` (docs/CONVERSATION_PROCESSOR_LAMBDA.md), triggered by `chatlogix-text-queue-prod` only |
| **Lambda `chatlogix-whatsapp-response-dispatcher`** | Sends WhatsApp messages, triggered by `chatlogix-response-queue-prod` |
| **Lambda `chatlogix-order-recovery`** | EventBridge-scheduled order-discrepancy sweep (`orderRecovery.handler`) |
| **Lambda `chatlogix-media-fetcher`** | Not functional — handler code doesn't exist yet; deferred |
| **API Gateway `weeju313k2`** | Public HTTPS URL → `chatlogix-webhook-handler`, route `/webhook` |

Save this file. Refer to it next time you onboard a teammate or set up staging. See the correction note at the top of this document for how these names diverged from the original 3-function setup this guide was written for.
