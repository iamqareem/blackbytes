import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MAX_WORDS = parseInt(process.env.SUMMARY_MAX_WORDS) || 60;
const MAX_CHARS = MAX_WORDS * 6;

let genAI = null;
let model = null;

function initGemini() {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
        console.warn('GEMINI_API_KEY not configured - using fallback truncation');
        return false;
    }
    try {
        genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        return true;
    } catch (err) {
        console.error('Failed to initialize Gemini:', err.message);
        return false;
    }
}

const hasGemini = initGemini();

function truncateToWords(text, maxWords) {
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) return text.trim();
    return words.slice(0, maxWords).join(' ') + '…';
}

function cleanText(text) {
    return text
        .replace(/https?:\/\/\S+/g, '')
        .replace(/@\w+/g, '')
        .replace(/#\w+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export async function summarize(text, title = '') {
    const cleaned = cleanText(text);
    if (!cleaned || cleaned.length < 50) {
        return truncateToWords(cleaned || title, MAX_WORDS);
    }

    if (!hasGemini || !model) {
        return truncateToWords(cleaned, MAX_WORDS);
    }

    const prompt = `Summarize this social media post in exactly ${MAX_WORDS} words or fewer. Be punchy, conversational, and capture the essence. No hashtags, no handles, no URLs. Just the story.

Title: "${title}"
Content: "${cleaned}"

Summary (<${MAX_WORDS} words):`;

    try {
        const result = await model.generateContent(prompt);
        const summary = result.response.text().trim();
        
        const wordCount = summary.split(/\s+/).length;
        if (wordCount > MAX_WORDS * 1.2) {
            return truncateToWords(summary, MAX_WORDS);
        }
        
        return summary;
    } catch (err) {
        console.error('Gemini summarization failed:', err.message);
        return truncateToWords(cleaned, MAX_WORDS);
    }
}

export async function summarizeBatch(items) {
    const results = [];
    for (const item of items) {
        const summary = await summarize(item.content || item.title, item.title);
        results.push({ ...item, summary });
        await new Promise(r => setTimeout(r, 100));
    }
    return results;
}

export { hasGemini, MAX_WORDS };