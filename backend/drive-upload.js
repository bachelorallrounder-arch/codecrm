import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const CRED_PATH = './config/oauth-client.json';
const TOKEN_PATH = './token.json';
const FOLDER_ID = process.env.GDRIVE_FOLDER_ID;

const credentials = JSON.parse(fs.readFileSync(CRED_PATH));
const { client_secret, client_id, redirect_uris } = credentials.installed;

const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));

const drive = google.drive({ version: 'v3', auth: oAuth2Client });

async function upload() {
  const filePath = './backup-test.csv';
  fs.writeFileSync(filePath, "id,name\n1,Test");

  const res = await drive.files.create({
    requestBody: {
      name: "backup-test.csv",
      parents: [FOLDER_ID]
    },
    media: {
      mimeType: "text/csv",
      body: fs.createReadStream(filePath)
    },
    fields: "id"
  });

  console.log("Uploaded file ID:", res.data.id);
}

upload();
