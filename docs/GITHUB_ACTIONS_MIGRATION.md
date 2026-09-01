# GitHub Actions Migration Guide

Migration plan for moving ChatLogix CI/CD from Bitbucket Pipelines to GitHub Actions.

The current Bitbucket pipeline does 4 things:

1. Build backend (TypeScript + Prisma generate)
2. Build frontend (Vite, needs `VITE_*` env vars)
3. Deploy 5 Lambda functions (zip → S3 → `aws lambda update-function-code`)
4. Deploy API + workers to Lightsail EC2 via SSH (runs `scripts/deployment/deploy-ec2.sh`)

This doc replicates all four on GitHub Actions.

---

## 1. Prerequisites

### 1.1 Create the GitHub repo

```bash
# On GitHub, create a new repo (e.g. chatlogix). Then locally:
git remote rename origin bitbucket          # keep the old remote as backup
git remote add origin git@github.com:<your-org>/chatlogix.git
git push -u origin master
git push origin --all                       # push every branch
git push origin --tags
```

> Keep the Bitbucket remote around for a week or two as a fallback. Don't delete the Bitbucket repo until the first successful GitHub Actions deploy.

### 1.2 Confirm `.gitattributes` is committed

LF line endings are mandatory for `bitbucket-pipelines.yml` and `scripts/deployment/deploy-ec2.sh`. The existing `.gitattributes` already covers this — make sure it's pushed to GitHub.

---

## 2. Secrets and variables

Map the current Bitbucket repository variables to GitHub. In your GitHub repo, go to:

**Settings → Secrets and variables → Actions**

### 2.1 Secrets (encrypted)

| GitHub Secret name | Source (Bitbucket var) | Used by |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | `AWS_ACCESS_KEY_ID` | Lambda deploy |
| `AWS_SECRET_ACCESS_KEY` | `AWS_SECRET_ACCESS_KEY` | Lambda deploy |
| `VITE_RECAPTCHA_SITE_KEY` | `VITE_RECAPTCHA_SITE_KEY` | Frontend build |
| `EC2_SSH_PRIVATE_KEY` | (from Bitbucket → Deployments → production → SSH keys, copy private key) | EC2 deploy |
| `EC2_HOST` | `EC2_HOST` | EC2 deploy |
| `EC2_USER` | `EC2_USER` | EC2 deploy |

### 2.2 Variables (plaintext, non-sensitive)

Under the **Variables** tab on the same page:

| GitHub Variable name | Value |
|---|---|
| `AWS_DEFAULT_REGION` | `ap-south-1` |
| `LAMBDA_S3_BUCKET` | `ap-south-1-chatlogix-lambda-deployments-prod` |
| `VITE_API_URL` | `https://chatlogix.in/api` |
| `VITE_ENVIRONMENT` | `production` |

> Why split? Secrets are masked in logs; variables aren't. URLs and bucket names don't need masking.

### 2.3 Environment for production (optional but recommended)

Create a GitHub Environment named `production`:

**Settings → Environments → New environment → `production`**

- Add a **required reviewer** if you want manual approval before EC2 deploys.
- Optionally restrict to `master` branch only.
- Environment-scoped secrets/variables override repo-level ones — handy if you later add a `staging` environment.

---

## 3. Directory layout

Create the workflow directory:

```
.github/
└── workflows/
    ├── ci.yml          # runs on PRs and on master push - builds backend + frontend
    ├── deploy.yml      # runs on master push after ci.yml succeeds - deploys lambdas + EC2
```

Splitting CI from deploy is cleaner than one big file: PRs only run the build, master triggers build + deploy.

---

## 4. `ci.yml` — build backend + frontend

```yaml
name: CI

on:
  pull_request:
    branches: [master]
  push:
    branches: [master]

jobs:
  build-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: npm
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        working-directory: backend
        run: npm ci

      - name: Generate Prisma client
        working-directory: backend
        run: npx prisma generate

      - name: Build
        working-directory: backend
        run: npm run build

      - name: Upload backend artifact
        uses: actions/upload-artifact@v4
        with:
          name: backend-dist
          path: |
            backend/dist/**
            backend/prisma/**
            backend/package.json
            backend/package-lock.json
          retention-days: 7

  build-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: npm
          cache-dependency-path: frontend_v2/package-lock.json

      - name: Write .env.production
        working-directory: frontend_v2/apps/web-vendor
        run: |
          cat > .env.production <<EOF
          VITE_API_URL=${{ vars.VITE_API_URL }}
          VITE_RECAPTCHA_SITE_KEY=${{ secrets.VITE_RECAPTCHA_SITE_KEY }}
          VITE_ENVIRONMENT=${{ vars.VITE_ENVIRONMENT }}
          EOF

      - name: Install dependencies
        working-directory: frontend_v2
        run: npm ci

      - name: Build
        working-directory: frontend_v2
        run: npm run build

      - name: Upload frontend artifact
        uses: actions/upload-artifact@v4
        with:
          name: frontend-dist
          path: |
            frontend_v2/apps/web-vendor/dist/**
            frontend_v2/apps/web-admin/dist/**
          retention-days: 7
```

**Mapping notes:**

- Bitbucket's `caches:` → `actions/setup-node@v4` with `cache: npm`. Faster and more correct (hashes the lockfile).
- Bitbucket's `artifacts:` → `actions/upload-artifact@v4`. Available to downstream jobs via `actions/download-artifact@v4`.
- Bitbucket's `parallel:` group → GitHub jobs without `needs:` run in parallel automatically.
- `vars.X` reads a non-secret variable; `secrets.X` reads a secret. Both are evaluated server-side, not exposed in logs (secrets are masked).

---

## 5. `deploy.yml` — Lambdas + EC2

```yaml
name: Deploy

on:
  push:
    branches: [master]
  workflow_dispatch:        # allows manual re-run from the Actions tab

jobs:
  build:
    uses: ./.github/workflows/ci.yml   # reuse the CI workflow to build artifacts

  deploy-lambdas:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: npm
          cache-dependency-path: backend/package-lock.json

      - name: Download backend artifact
        uses: actions/download-artifact@v4
        with:
          name: backend-dist
          path: backend

      - name: Install production deps
        working-directory: backend
        run: |
          npm ci
          npx prisma generate
          npm prune --production

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ vars.AWS_DEFAULT_REGION }}

      - name: Package Lambda zip
        working-directory: backend
        run: bash scripts/package-lambda.sh /tmp/lambda.zip

      - name: Deploy each Lambda
        working-directory: backend
        env:
          LAMBDA_S3_BUCKET: ${{ vars.LAMBDA_S3_BUCKET }}
          AWS_DEFAULT_REGION: ${{ vars.AWS_DEFAULT_REGION }}
        run: |
          for fn in chatlogix-whatsapp-response-dispatcher \
                    chatlogix-media-fetcher \
                    chatlogix-incoming-response-generator \
                    chatlogix-webhook-handler \
                    chatlogix-order-recovery; do
            echo "=== Uploading $fn to S3 ==="
            aws s3 cp /tmp/lambda.zip \
              "s3://${LAMBDA_S3_BUCKET}/functions/$fn/${GITHUB_SHA}.zip" \
              --region "${AWS_DEFAULT_REGION}"

            echo "=== Updating Lambda $fn ==="
            aws lambda update-function-code \
              --function-name "$fn" \
              --s3-bucket "${LAMBDA_S3_BUCKET}" \
              --s3-key "functions/$fn/${GITHUB_SHA}.zip" \
              --region "${AWS_DEFAULT_REGION}" \
              --publish

            aws lambda wait function-updated \
              --function-name "$fn" \
              --region "${AWS_DEFAULT_REGION}"

            echo "=== $fn deployed ==="
          done

  deploy-ec2:
    needs: deploy-lambdas
    runs-on: ubuntu-latest
    environment: production           # ties into the GitHub Environment from §2.3
    steps:
      - uses: actions/checkout@v4

      - name: Set up SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.EC2_SSH_PRIVATE_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan -H "${{ secrets.EC2_HOST }}" >> ~/.ssh/known_hosts

      - name: Run deploy script on EC2
        run: |
          ssh -i ~/.ssh/id_ed25519 \
              "${{ secrets.EC2_USER }}@${{ secrets.EC2_HOST }}" \
              'bash -s' < scripts/deployment/deploy-ec2.sh
```

**Mapping notes:**

- Bitbucket's `atlassian/ssh-run` pipe → plain `ssh ... 'bash -s' < script.sh`. Simpler and avoids the `MODE: 'script'` footgun that bit us before. The local script gets piped to bash on the remote.
- Bitbucket's `${BITBUCKET_COMMIT}` → GitHub's `${GITHUB_SHA}`.
- `aws-actions/configure-aws-credentials@v4` is the official AWS action — handles credential masking and is what AWS docs recommend.
- The `environment: production` line is what activates the manual approval gate (if you configured one in §2.3).

### Optional: use OIDC instead of AWS keys

Long-lived `AWS_ACCESS_KEY_ID` secrets are a security smell. If you have time, swap them for OIDC:

1. In AWS IAM, create an OIDC identity provider for `token.actions.githubusercontent.com`.
2. Create an IAM role whose trust policy permits `repo:<your-org>/chatlogix:ref:refs/heads/master`.
3. Replace the `configure-aws-credentials` block with:

   ```yaml
   - uses: aws-actions/configure-aws-credentials@v4
     with:
       role-to-assume: arn:aws:iam::987272474004:role/github-actions-chatlogix
       aws-region: ${{ vars.AWS_DEFAULT_REGION }}
   ```

4. Also add at the workflow or job level:

   ```yaml
   permissions:
     id-token: write
     contents: read
   ```

This eliminates the access-key secrets entirely. Not required for the initial migration — do it as a follow-up.

---

## 6. Cutover checklist

1. [ ] Push `master` to GitHub.
2. [ ] Add all secrets and variables from §2.
3. [ ] Create the `production` environment (§2.3).
4. [ ] Commit `.github/workflows/ci.yml` and `.github/workflows/deploy.yml` to a feature branch.
5. [ ] Open a PR — verify `ci.yml` runs and both build jobs pass.
6. [ ] Merge the PR — verify `deploy.yml` runs, Lambdas update, EC2 deploy completes.
7. [ ] Once green: disable the Bitbucket pipeline (Repository settings → Pipelines → Settings → toggle off). Keep the repo around for a couple of weeks.
8. [ ] Update any docs that reference Bitbucket (e.g. README, `docs/DEPLOYMENT.md`).
9. [ ] Remove `bitbucket-pipelines.yml` after the second successful deploy.

---

## 7. Cost

GitHub Actions free tier on a **private** repo (3 users):

- 2,000 minutes/month included
- Linux runners count at 1× (Windows 2×, macOS 10×)
- Free Lambda + Lightsail + S3 traffic is unchanged

Current Bitbucket usage is ~54 min/run × few runs/week — comfortably inside the 2,000-minute envelope. If you go **public**, Actions minutes are unlimited and free.

If you exceed 2,000 minutes: $0.008/minute (~$8 for an extra 1,000 minutes) — still cheaper than Bitbucket Standard's $9 flat fee.

---

## 8. Equivalence table (Bitbucket → GitHub)

| Bitbucket Pipelines | GitHub Actions |
|---|---|
| `image: node:18` | `runs-on: ubuntu-latest` + `actions/setup-node@v4` |
| `caches:` block | `cache:` parameter on `setup-node` |
| `artifacts:` | `actions/upload-artifact@v4` / `actions/download-artifact@v4` |
| `parallel:` | Multiple `jobs:` without `needs:` |
| `step: deployment: production` | `environment: production` on a job |
| Repository variables | `secrets.*` (sensitive) / `vars.*` (plain) |
| `${BITBUCKET_COMMIT}` | `${{ github.sha }}` or `$GITHUB_SHA` |
| `${BITBUCKET_BRANCH}` | `${{ github.ref_name }}` |
| `atlassian/ssh-run` pipe | Raw `ssh` + `appleboy/ssh-action` (if you prefer an action) |
| `pull-requests:` trigger | `on: pull_request:` |

---

## 9. Troubleshooting

**Frontend build fails with `VITE_RECAPTCHA_SITE_KEY missing`**
The `.env.production` write step in §4 must run before `npm run build`. If you split the build into a separate job, the `.env.production` file does not survive across jobs — write it in the same job that builds.

**EC2 SSH step fails with `Permission denied (publickey)`**
The `EC2_SSH_PRIVATE_KEY` secret must be the *private* key whose public counterpart is in `~/.ssh/authorized_keys` on the EC2 box. Paste it including the `-----BEGIN ... PRIVATE KEY-----` header and trailing newline. GitHub strips trailing whitespace on save; if SSH complains about format, base64-encode the key before pasting and decode in the workflow.

**Lambda `update-function-code` fails with `ResourceNotFoundException`**
The function name in the loop doesn't match a real Lambda. Cross-check against the AWS console — see the actual names committed in the current `bitbucket-pipelines.yml`.

**Line-ending errors on the EC2 deploy**
`scripts/deployment/deploy-ec2.sh` must be LF. The `.gitattributes` rule `*.sh text eol=lf` enforces this; verify with `file scripts/deployment/deploy-ec2.sh` — it should say `Bourne-Again shell script, ASCII text executable`, *not* `with CRLF line terminators`.
