import fs from 'fs';
import { google } from 'googleapis';

const CRED_PATH = './config/oauth-client.json';
const TOKEN_PATH = './token.json';

const credentials = JSON.parse(fs.readFileSync(CRED_PATH));
const { client_secret, client_id, redirect_uris } = credentials.installed;

const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive'
];

const url = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: "consent"
});

console.log("Authorize this app by visiting this URL:\n", url);

process.stdin.on("data", async (code) => {
  code = code.toString().trim();
  const { tokens } = await oAuth2Client.getToken(code);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  console.log("Token saved to token.json");
  process.exit();
});
