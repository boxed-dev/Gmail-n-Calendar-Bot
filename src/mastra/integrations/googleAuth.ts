import { OAuth2Client, Credentials } from 'google-auth-library';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { inspect } from 'util';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

const PROJECT_ROOT = path.join(process.cwd(), '..', '..'); 
const USER_TOKENS_PATH = path.join(PROJECT_ROOT, 'user-tokens.json');
const CREDENTIALS_PATH = path.join(PROJECT_ROOT, 'google-credentials.json');

let userTokensCache: { [key: string]: Credentials } = {};
let credentialsCache: any = null;

function loadCredentials() {
  if (credentialsCache) {
    return credentialsCache;
  }
  console.log(`[Debug googleAuth] process.cwd(): ${process.cwd()}`);
  console.log(`[Debug googleAuth] Checking for credentials at: ${CREDENTIALS_PATH}`);
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('Google API credentials file not found. Please create google-credentials.json or run setup script.');
    throw new Error('Google API credentials not found');
  }
  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
  credentialsCache = JSON.parse(content);
  return credentialsCache;
}

function loadUserTokens(): { [key: string]: Credentials } {
  if (Object.keys(userTokensCache).length > 0) {
    return userTokensCache;
  }
  if (fs.existsSync(USER_TOKENS_PATH)) {
    try {
      const content = fs.readFileSync(USER_TOKENS_PATH, 'utf-8');
      userTokensCache = JSON.parse(content);
      return userTokensCache;
    } catch (error) {
      console.error('Error reading user tokens file, starting fresh:', error);
      userTokensCache = {};
      return {};
    }
  }
  userTokensCache = {};
  return {};
}

function saveUserTokens(tokens: { [key: string]: Credentials }) {
  try {
    fs.writeFileSync(USER_TOKENS_PATH, JSON.stringify(tokens, null, 2));
    userTokensCache = tokens;
  } catch (error) {
    console.error('Error saving user tokens:', error);
  }
}

export function createOAuth2Client(): OAuth2Client {
  const credentials = loadCredentials();
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

export function generateAuthUrl(oAuth2Client: OAuth2Client): string {
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
}

export async function exchangeCodeForToken(oAuth2Client: OAuth2Client, code: string, userId: string): Promise<boolean> {
  try {
    console.log(`Exchanging code for token for user: ${userId}`);
    const { tokens } = await oAuth2Client.getToken(code);
    console.log(`Received tokens for user ${userId}:`, inspect(tokens, { depth: 1 }));

    if (!tokens.access_token || !tokens.refresh_token) {
        console.error(`Error: Missing access_token or refresh_token for user ${userId}`);
        const checkAuthUrl = generateAuthUrl(oAuth2Client);
        console.error(`Please ensure the OAuth consent screen is configured correctly and user grants offline access. Maybe try this URL: ${checkAuthUrl}`);
        return false;
    }

    const allTokens = loadUserTokens();
    allTokens[userId] = tokens;
    saveUserTokens(allTokens);
    console.log(`Token stored successfully for user: ${userId}`);
    return true;
  } catch (error) {
    console.error(`Error retrieving or storing access token for user ${userId}:`, error);
    return false;
  }
}

export async function getAuthenticatedClient(userId: string): Promise<OAuth2Client | null> {
  const allTokens = loadUserTokens();
  const userToken = allTokens[userId];

  if (!userToken) {
    console.log(`No token found for user ${userId}. Authentication required.`);
    return null;
  }

  const oAuth2Client = createOAuth2Client();
  oAuth2Client.setCredentials(userToken);

  const expiryBuffer = 5 * 60 * 1000; 
  if (userToken.expiry_date && userToken.expiry_date < (Date.now() + expiryBuffer)) {
    console.log(`Token for user ${userId} is expired or nearing expiry, refreshing...`);
    try {
      const { credentials } = await oAuth2Client.refreshAccessToken();
      console.log(`Refreshed token for user ${userId}:`, inspect(credentials, { depth: 1 }));
      
      const updatedTokens = { ...userToken, ...credentials }; 
      
      allTokens[userId] = updatedTokens;
      saveUserTokens(allTokens);
      oAuth2Client.setCredentials(updatedTokens);
      console.log(`Token refreshed and saved successfully for user: ${userId}`);
    } catch (refreshError) {
      console.error(`Error refreshing access token for user ${userId}:`, refreshError);
      delete allTokens[userId];
      saveUserTokens(allTokens);
      return null; 
    }
  }
  
  return oAuth2Client;
}

export async function getGmailService(userId: string) {
  const auth = await getAuthenticatedClient(userId);
  if (!auth) return null;
  return google.gmail({ version: 'v1', auth });
}

export async function getCalendarService(userId: string) {
  const auth = await getAuthenticatedClient(userId);
  if (!auth) return null;
  return google.calendar({ version: 'v3', auth });
} 