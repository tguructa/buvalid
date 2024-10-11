// app.js
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();
app.use(cors()); // Enable CORS for all routes
app.use(bodyParser.json());

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = process.env.CLAUDE_API_URL || 'https://api.anthropic.com/v1/complete';
const MAX_RETRIES = process.env.MAX_RETRIES || 3;

async function callClaudeApi(prompt) {
  const headers = {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
  };

  const data = {
      model: "claude-2.1",
      prompt: `\n\nHuman: ${prompt}\n\nAssistant:`,
      max_tokens_to_sample: 1000,
      temperature: 0.7,
  };

  try {
      const response = await axios.post(CLAUDE_API_URL, data, { headers });
      return response.data.completion;
  } catch (error) {
      console.error('Error calling Claude API:', error.response ? error.response.data : error.message);
      throw error;
  }
}

function parseResponse(response) {
    const result = {};
    const sections = response.split(/\n(?=[A-Z][a-zA-Z\s]*(?:[A-Z][a-zA-Z]*)?:)/).filter(s => s.trim());

    const expectedSections = [
        'Summary', 'Market Demand', 'Ability to Pay', 'Challenges and Opportunities', 
        'Key Competitors', 'Ability to Scale', 'Resources Required', 
        'Steps to Validate', 'Getting Started', 'Constructive Feedback'
    ];

    sections.forEach((section) => {
        const [sectionName, ...contentLines] = section.split('\n');
        let content = contentLines.join('\n').trim();

        // Remove leading dashes from content
        content = content.replace(/^-+\s*/, '').trim();

        const sectionKey = sectionName.replace(':', '').trim();

        if (sectionKey === 'Key Competitors') {
            result[sectionKey] = parseCompetitors(content);
        } else {
            result[sectionKey] = content;
        }
    });

    // Ensure all expected sections are present
    expectedSections.forEach((key) => {
        if (!result.hasOwnProperty(key)) {
            result[key] = '';
        }
    });

    return result;
}


function parseCompetitors(content) {
    const competitors = [];
    const competitorSections = content.split(/Competitor #\d+:/g).filter(s => s.trim());

    competitorSections.forEach(section => {
        const competitor = {};
        section.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split(':');
            if (valueParts.length > 0) {
                competitor[key.trim()] = valueParts.join(':').trim();
            }
        });
        if (Object.keys(competitor).length > 0) {
            competitors.push(competitor);
        }
    });

    return competitors;
}


function generatePrompt(businessIdea, advisorType) {
    const structure = `
Summary:
Market Demand:
Ability to Pay:
Challenges and Opportunities:
Key Competitors:
Competitor #1:
    Name:
    Strengths:
    Weaknesses:
Competitor #2:
    Name:
    Strengths:
    Weaknesses:
Competitor #3:
    Name:
    Strengths:
    Weaknesses:
Ability to Scale:
Resources Required:
Steps to Validate:
Getting Started:
Constructive Feedback:
    `;

    const basePrompt = `Provide feedback on this business idea: ${businessIdea}. Structure your response using the following format:\n${structure}\nEnsure each section is properly labeled.`;

    switch (advisorType.toLowerCase()) {
        case 'strategist':
            return `As a strategic advisor, ${basePrompt} Provide a professional and balanced perspective.`;
        case 'cheerleader':
            return `As an enthusiastic supporter, ${basePrompt} Provide overly positive feedback.`;
        case 'realist':
            return `As a pragmatic advisor, ${basePrompt} Be brutally honest and direct about the flaws.`;
        case 'roaster':
            return `As a humorous critic, ${basePrompt} Roast this idea humorously while still providing constructive feedback.`;
        case 'innovator':
            return `As an innovation expert, ${basePrompt} Analyze how innovative and disruptive this idea is.`;
        case 'skeptic':
            return `As a skeptical advisor, ${basePrompt} Focus on the potential risks and challenges.`;
        case 'investor':
            return `As a potential investor, ${basePrompt} Evaluate this idea from an investment perspective.`;
        case 'dreamer':
            return `As a visionary thinker, ${basePrompt} Provide feedback on how this idea could change the world.`;
        case 'analyst':
            return `As a data-driven analyst, ${basePrompt} Analyze this idea from a quantitative perspective.`;
        case 'consumer':
            return `As a potential consumer, ${basePrompt} Provide feedback from a user's perspective.`;
        default:
            return `As a general advisor, ${basePrompt} Provide comprehensive feedback on all aspects of the idea.`;
    }
}

async function validateBusinessIdea(businessIdea, advisorType) {
    const prompt = generatePrompt(businessIdea, advisorType);
    
    let attempts = 0;
    while (attempts < MAX_RETRIES) {
        try {
            const response = await callClaudeApi(prompt);
            return parseResponse(response);
        } catch (error) {
            attempts++;
            if (attempts >= MAX_RETRIES) {
                throw new Error(`Failed to generate response after ${MAX_RETRIES} attempts`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Exponential backoff
        }
    }
    throw new Error(`Failed to generate response after ${MAX_RETRIES} attempts`);
}

app.post('/validate', async (req, res) => {
    try {
        const { businessIdea, advisorType } = req.body;
        const result = await validateBusinessIdea(businessIdea, advisorType);
        res.json(result);
    } catch (error) {
        console.error('Error in /validate route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});