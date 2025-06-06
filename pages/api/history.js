import fs from 'fs';
import path from 'path';

const getTodayFilename = () => {
    const today = new Date().toISOString().slice(0, 10); // e.g. 2025-06-05
    return `history-${today}.json`;
};

const getFilePath = () => {
    const fileName = getTodayFilename();
    const dir = path.join(process.cwd(), 'data');
    const filePath = path.join(dir, fileName);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }

    // Auto-create file if missing
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]');
    }

    return filePath;
};

export default function handler(req, res) {
    const filePath = getFilePath();

    if (req.method === 'GET') {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            res.status(200).json(JSON.parse(data));
        } catch (err) {
            res.status(500).json({ error: 'Failed to read history file' });
        }
    }

    if (req.method === 'POST') {
        const newHistory = req.body;
        try {
            fs.writeFileSync(filePath, JSON.stringify(newHistory, null, 2));
            res.status(200).json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    }
}

