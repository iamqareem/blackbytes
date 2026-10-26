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

/**
 * Summarize a social media post, with optional Gemini vision to describe
 * the main visual element when no media_url is available.
 * 
 * @param {string} text - post content/text
 * @param {string} title - post title
 * @param {string|null} mediaUrl - optional direct media URL (image/video)
 * @param {boolean} useVision - whether to attempt Gemini vision description
 * @returns {{summary: string, mediaCaption?: string}} - text summary + optional visual caption
 */
export async function summarize(text, title = '', mediaUrl = null, useVision = true) {
    const cleaned = cleanText(text);
    
    // Always produce a text summary first
    let summary = '';
    if (!cleaned || cleaned.length < 50) {
        summary = truncateToWords(cleaned || title, MAX_WORDS);
    } else if (!hasGemini || !model) {
        summary = truncateToWords(cleaned, MAX_WORDS);
    } else {
        try {
            const prompt = `Summarize this social media post in exactly ${MAX_WORDS} words or fewer. Be punchy, conversational, and capture the essence. No hashtags, no handles, no URLs. Just the story.

Title: "${title}"
Content: "${cleaned}"

Summary (<${MAX_WORDS} words):`;
            const result = await model.generateContent(prompt);
            const summaryText = result.response.text().trim();
            const wordCount = summaryText.split(/\s+/).length;
            if (wordCount > MAX_WORDS * 1.2) {
                summary = truncateToWords(summaryText, MAX_WORDS);
            } else {
                summary = summaryText;
            }
        } catch (err) {
            console.error('Gemini summarization failed:', err.message);
            summary = truncateToWords(cleaned, MAX_WORDS);
        }
    }

    // Attempt Gemini vision to describe the main visual element
    let mediaCaption = null;
    if (useVision && model) {
        try {
            const visionPrompt = mediaUrl
                ? `Based on this title and text, describe the main visual element in one sentence. Output only the sentence, no other text.

Title: "${title}"
Content: "${cleaned}"`
                : `Describe a suitable illustrative image for this social media post in one sentence. Output only the description.

Title: "${title}"
Content: "${cleaned}"`;

            const visionResult = await model.generateContent(visionPrompt);
            const visionText = visionResult.response.text().trim();
            // Validate it's a single sentence-ish description
            if (visionText && visionText.length > 5 && visionText.length < 200) {
                mediaCaption = visionText;
            }
        } catch (err) {
            console.error('Gemini vision failed:', err.message);
            // Don't fall through — mediaCaption stays null
        }
    }

    return { summary, mediaCaption };
}

/**
 * Summarize a batch of items, attaching both text summary and optional media caption.
 * 
 * @param {Array} items - each item: { title, content, media_url, media_type, source_url, source_name, category, published_at }
 * @param {boolean} useVision - whether to attempt Gemini vision descriptions
 * @returns {Array} items enriched with { summary, mediaCaption }
 */
export async function summarizeBatch(items, useVision = true) {
    const results = [];
    for (const item of items) {
        const { summary, mediaCaption } = await summarize(
            item.content || item.title,
            item.title,
            item.media_url,
            useVision
        );
        results.push({ ...item, summary, mediaCaption });
        await new Promise(r => setTimeout(r, 100));
    }
    return results;
}

export { hasGemini, MAX_WORDS };