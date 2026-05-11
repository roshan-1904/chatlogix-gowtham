import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import path from 'path';
import { env } from './env.js';

type ServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

let cachedApp: admin.app.App | null = null;

function resolveServiceAccount(): ServiceAccount {
  if (env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH) {
    const absolutePath = path.isAbsolute(env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH)
      ? env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH
      : path.resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH);
    const fileContents = readFileSync(absolutePath, 'utf-8');
    const parsed = JSON.parse(fileContents);

    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error('Service account file is missing required fields');
    }

    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key
    };
  }

  if (!env.FIREBASE_PRIVATE_KEY) {
    throw new Error('FIREBASE_PRIVATE_KEY must be provided when FIREBASE_SERVICE_ACCOUNT_KEY_PATH is not set');
  }

  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL) {
    throw new Error('FIREBASE_PROJECT_ID and FIREBASE_CLIENT_EMAIL must be provided when using FIREBASE_PRIVATE_KEY');
  }

  return {
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  };
}

function initializeFirebaseApp(): admin.app.App {
  if (cachedApp) {
    return cachedApp;
  }

  const serviceAccount = resolveServiceAccount();

  cachedApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: serviceAccount.projectId,
      clientEmail: serviceAccount.clientEmail,
      privateKey: serviceAccount.privateKey
    })
  });

  return cachedApp;
}

export function getFirebaseApp(): admin.app.App {
  return initializeFirebaseApp();
}

export function getFirebaseAuth(): admin.auth.Auth {
  return initializeFirebaseApp().auth();
}


