const express = require('express');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Google Sheets Setup
const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Nodemailer Setup
// Nodemailer Setup
// Remove spaces from password if present
const emailPass = process.env.EMAIL_PASS ? process.env.EMAIL_PASS.replace(/\s+/g, '') : '';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: emailPass,
    },
});

// Helper to get the first sheet name
async function getFirstSheetName() {
    const meta = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
    });
    return meta.data.sheets[0].properties.title;
}

// API: Preview Data
app.get('/api/preview', async (req, res) => {
    try {
        const sheetName = await getFirstSheetName();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:Z`, // Use dynamic sheet name
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return res.json({ headers: [], data: [] });
        }

        const headers = rows[0];
        const data = rows.slice(1).map((row, index) => {
            // Create an object mapping headers to values
            let obj = { _rowIndex: index + 2 }; // 1-based index, +1 for header
            headers.forEach((header, i) => {
                obj[header] = row[i] || '';
            });
            return obj;
        });

        res.json({ headers, data });
    } catch (error) {
        console.error('Error fetching sheets:', error);
        res.status(500).json({ error: '無法從 Google 試算表讀取資料' });
    }
});

// API: Execute Auto-Reply
app.post('/api/execute', async (req, res) => {
    try {
        const sheetName = await getFirstSheetName();
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:Z`,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return res.json({ message: '未找到資料', processed: 0 });
        }

        const headers = rows[0];
        // Find column indices
        const nameIndex = headers.indexOf('姓名');
        const emailIndex = headers.indexOf('Email'); // Adjust based on actual header name
        const statusIndex = headers.indexOf('是否自動回覆');

        if (nameIndex === -1 || emailIndex === -1 || statusIndex === -1) {
            return res.status(400).json({ error: '找不到必要的欄位 (姓名, Email, 是否自動回覆)' });
        }

        let processedCount = 0;
        const updates = [];

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const name = row[nameIndex];
            const email = row[emailIndex];
            const status = row[statusIndex];
            const rowIndex = i + 1; // 1-based index

            if (!status || status.trim() === '') {
                if (email && name) {
                    // Send Email
                    const mailOptions = {
                        from: process.env.EMAIL_USER,
                        to: email,
                        subject: '感謝您喜愛我們的產品！',
                        text: `Hi ${name},\n\n感謝您喜歡我們的某項產品！我們很高興能為您服務。\n\nBest regards,\nYanwun`,
                        // html: `<p>Hi ${name},</p><p>感謝您喜歡我們的某項產品！我們很高興能為您服務。</p>`
                    };

                    try {
                        await transporter.sendMail(mailOptions);
                        console.log(`Email sent to ${email}`);

                        // Mark as processed
                        // We need to update the specific cell. 
                        // Using batchUpdate or values.update would be better but for simplicity in loop, 
                        // we can collect updates or just update one by one (slower but safer for small batches).
                        // Let's update one by one for now to ensure it's marked only if email sent.

                        await sheets.spreadsheets.values.update({
                            spreadsheetId: SPREADSHEET_ID,
                            range: `${sheetName}!${getColumnLetter(statusIndex + 1)}${rowIndex}`,
                            valueInputOption: 'RAW',
                            resource: {
                                values: [['Y']]
                            }
                        });

                        processedCount++;
                    } catch (emailError) {
                        console.error(`Failed to send email to ${email}:`, emailError);
                    }
                }
            }
        }

        res.json({ message: '執行完成', processed: processedCount });

    } catch (error) {
        console.error('Error executing tasks:', error);
        res.status(500).json({ error: '執行任務失敗' });
    }
});

// Helper to convert column index (1-based) to letter (e.g., 1 -> A, 2 -> B)
function getColumnLetter(columnIndex) {
    let temp, letter = '';
    while (columnIndex > 0) {
        temp = (columnIndex - 1) % 26;
        letter = String.fromCharCode(temp + 65) + letter;
        columnIndex = (columnIndex - temp - 1) / 26;
    }
    return letter;
}

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
