const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function sendChatMessage(messages: ChatMessage[], subject: string = 'General') {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

  const systemPrompt = `You are an expert IB (International Baccalaureate) tutor specializing in ${subject}. 
  You help students understand complex concepts, provide study guidance, and answer questions in a clear, engaging way. 
  Always be encouraging and provide specific examples when possible. Keep responses concise but thorough.`;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Project 45 - IB Learning Platform'
    },
    body: JSON.stringify({
      model: 'mistralai/mixtral-8x7b-instruct',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
}

export async function generateFlashcards(topic: string, count: number = 5) {
  const prompt = `Generate ${count} flashcards for the IB topic: "${topic}". 
  Return ONLY a JSON array of objects with "question" and "answer" fields. 
  Make questions challenging but appropriate for IB level students.
  
  Example format:
  [{"question": "What is...", "answer": "The answer is..."}]`;

  const response = await sendChatMessage([{ role: 'user', content: prompt }]);
  
  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('No valid JSON found in response');
  } catch (error) {
    console.error('Error parsing flashcards:', error);
    throw new Error('Failed to generate flashcards');
  }
}

export async function markEssay(essayType: string, content: string, title: string) {
  const prompt = `As an experienced IB examiner, mark this ${essayType} essay titled "${title}".
  
  Essay content:
  ${content}
  
  Provide:
  1. A numerical score out of the maximum marks for this essay type
  2. Detailed feedback on strengths and areas for improvement
  3. Specific suggestions for enhancement
  
  Be slightly harsher than average IB marking standards to help the student improve.
  
  Format your response as:
  SCORE: X/Y
  
  FEEDBACK:
  [Your detailed feedback here]`;

  return await sendChatMessage([{ role: 'user', content: prompt }]);
}