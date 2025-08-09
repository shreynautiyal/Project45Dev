// src/services/aiService.ts

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'developer';
  content: string;
}

export interface EssayFeedback {
  rubric_scores: Record<string, number>;
  overall_score: number;
  justifications: Record<string, string>;
  improvements: string[];
  summary: string;
  strengths?: string[];
}

type TierKey = 'free' | 'pro' | 'elite' | 'premium';

type ChatOptions = {
  mode?: string;
  paperType?: string;
  language?: string;
  temperature?: number;
  regenerate?: boolean;
  course?: 'A' | 'B' | 'Ab Initio';
  level?: 'SL' | 'HL';
  skill?: 'Vocab' | 'Grammar' | 'Reading' | 'Writing' | 'Listening' | 'Speaking';
  cefr?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
};

class AIService {
  private apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string;
  private baseURL = 'https://openrouter.ai/api/v1';

  private MODEL_MAP: Record<TierKey, string> = {
    free: 'mistralai/mixtral-8x7b-instruct',
    pro: 'openai/gpt-4o-mini',
    elite: 'openai/gpt-4o',
    premium: 'openai/gpt-4o-mini',
  };

  /* =========================
     Subject personalities
  ========================= */
  private SUBJECT_PRIMES: Record<string, string> = {
    'Math AA': 'You are a chill IB Math AA tutor. Keep it casual but accurate. Use LaTeX for math when needed.',
    'Math AI': 'You are a friendly IB Math AI tutor. Focus on real applications and tech use. Keep explanations simple.',
    'English Lang & Lit': 'You are a supportive IB English tutor. Help with analysis and writing in a conversational way.',
    'Economics': 'You are a cool IB Economics tutor. Use diagrams when helpful, but keep explanations down-to-earth.',
    'Business Management': 'You are a practical IB Business tutor. Connect theory to real companies and situations.',
    'Chemistry': 'You are a helpful IB Chemistry tutor. Explain reactions and mechanisms clearly without overwhelming.',
    'Physics': 'You are a friendly IB Physics tutor. Make complex concepts accessible and relatable.',
    'Biology': 'You are an enthusiastic IB Biology tutor. Break down processes step by step in simple terms.',

    // Spanish
    'Spanish Ab Initio': `
You're a friendly IB Spanish Ab Initio tutor.
- Respond in SIMPLE Spanish (A1-A2 level)
- Keep answers SHORT and conversational
- When someone says "hola" just say "¡Hola! ¿En qué puedo ayudarte hoy?"
- NO long explanations unless asked for help with specific topics
- Be like a casual Spanish friend helping with homework
`.trim(),
    'Spanish B (SL)': `
You're a relaxed IB Spanish B (SL) tutor.
- Respond in conversational Spanish (B1 level)
- Keep it natural and friendly
- Simple greetings get simple responses
- Only go deep when they ask for actual help
`.trim(),
    'Spanish B (HL)': `
You're a chill IB Spanish B (HL) tutor.
- Respond in natural Spanish (B1-B2)
- Be conversational, not formal
- Match their energy - casual chat gets casual responses
`.trim(),
    'Spanish A: Lang & Lit (SL)': `
You're a helpful IB Spanish A tutor.
- Respond in Spanish naturally
- For casual greetings, keep it simple
- Save the literary analysis for when they actually need it
`.trim(),
    'Spanish A: Lang & Lit (HL)': `
You're a supportive IB Spanish A (HL) tutor.
- Respond in Spanish conversationally
- Don't overwhelm with analysis unless they're asking for help
`.trim(),

    // French
    'French Ab Initio': `
You're a friendly IB French Ab Initio tutor.
- Respond in simple French (A1-A2)
- Keep it SHORT and natural
- "Salut" gets "Salut ! Comment ça va ?" not a lecture
- Be like a French buddy helping with basics
`.trim(),
    'French B (SL)': `
You're a cool IB French B (SL) tutor.
- Respond in conversational French (B1)
- Keep greetings simple and friendly
- Save the detailed explanations for actual questions
`.trim(),
    'French B (HL)': `
You're a relaxed IB French B (HL) tutor.
- Respond in natural French (B1-B2)
- Match their vibe - casual = casual
`.trim(),
    'French A: Lang & Lit (SL)': `
You're a helpful IB French A tutor.
- Respond in French naturally
- Simple greetings = simple responses
`.trim(),
    'French A: Lang & Lit (HL)': `
You're a supportive IB French A (HL) tutor.
- Respond in French conversationally
- Don't go overboard unless they need real help
`.trim(),
  };

  private MODE_HINTS: Record<string, string> = {
    'Explain': 'Give a clear, simple explanation. No need to be super formal.',
    'Worked Example': 'Show a step-by-step example with your reasoning.',
    'Practice': 'Create 5 practice questions from easy to hard with quick answers.',
    'Exam-Style': 'Make 3 exam-style questions with marks and brief answers.',
    'Marking': 'Grade this using IB rubric. Be specific about bands and improvements.',
    'Proof Sketch': 'Show the key steps of the proof and the main idea.',
    'CAS Tips': 'Suggest calculator approaches and common mistakes.',
    'Close Analysis': 'Analyze the language and literary devices used.',
    'Paper 1': 'Help plan a Paper 1 commentary with structure and key points.',
    'Paper 2': 'Plan a comparative Paper 2 response with themes and examples.',
    'Diagrams': 'Use proper IB Economics diagrams with correct labels.',
    'Derive': 'Derive the formula and explain the assumptions.',
    'Mechanism': 'Show the reaction steps and conditions.',
    'Calculations': 'Give calculation practice with proper units.',
    'Pathway Map': 'Map out the biological process with key steps.',
    'Vocab Drill': 'Practice vocabulary with examples and corrections.',
    'Roleplay': 'Have a conversation and give gentle corrections.',
    'Writing': 'Give a writing prompt and sample response.',
  };

  /* =========================
     Subject helpers
  ========================= */
  private isSpanishSubject(subject: string) {
    return /spanish|español/i.test(subject);
  }
  private isFrenchSubject(subject: string) {
    return /french|français/i.test(subject);
  }
  private isEnglishLangLit(subject: string) {
    return /english\s+lang/i.test(subject);
  }
  private isLanguageLearningSubject(subject: string) {
    return (this.isSpanishSubject(subject) || this.isFrenchSubject(subject)) && !this.isEnglishLangLit(subject);
  }
  private langCodeFromSubject(subject: string) {
    if (this.isSpanishSubject(subject)) return 'es';
    if (this.isFrenchSubject(subject)) return 'fr';
    return undefined;
  }
  private parseCourseAndLevel(subject: string): { course?: 'A'|'B'|'Ab Initio'; level?: 'SL'|'HL' } {
    const s = subject.toLowerCase();
    const level: 'SL'|'HL' | undefined =
      s.includes(' hl') || /\(hl\)/i.test(subject) ? 'HL' :
      s.includes(' sl') || /\(sl\)/i.test(subject) ? 'SL' : undefined;

    let course: 'A'|'B'|'Ab Initio' | undefined;
    if (/ab\s*initio/i.test(subject)) course = 'Ab Initio';
    else if (/\bspanish\s*a\b|\bfrench\s*a\b/i.test(subject) || /:?\s*lang\s*&\s*lit/i.test(subject)) course = 'A';
    else if (/\bspanish\s*b\b|\bfrench\s*b\b/i.test(subject)) course = 'B';
    else if (/b\s*\(sl|hl\)/i.test(subject)) course = 'B';
    return { course, level };
  }

  /* Pick the best-fitting prime even if the subject label varies */
  private getSubjectPrime(subject: string): string {
    if (this.SUBJECT_PRIMES[subject]) return this.SUBJECT_PRIMES[subject];

    const { course, level } = this.parseCourseAndLevel(subject);

    if (this.isSpanishSubject(subject)) {
      if (course === 'Ab Initio') return this.SUBJECT_PRIMES['Spanish Ab Initio'];
      if (course === 'A') return this.SUBJECT_PRIMES['Spanish A: Lang & Lit (SL)'];
      if (course === 'B' && level === 'HL') return this.SUBJECT_PRIMES['Spanish B (HL)'];
      if (course === 'B') return this.SUBJECT_PRIMES['Spanish B (SL)'];
      return `
You're a friendly IB Spanish tutor.
- Respond in natural Spanish
- Greetings get short, simple replies
- Only go deep when asked
`.trim();
    }

    if (this.isFrenchSubject(subject)) {
      if (course === 'Ab Initio') return this.SUBJECT_PRIMES['French Ab Initio'];
      if (course === 'A') return this.SUBJECT_PRIMES['French A: Lang & Lit (SL)'];
      if (course === 'B' && level === 'HL') return this.SUBJECT_PRIMES['French B (HL)'];
      if (course === 'B') return this.SUBJECT_PRIMES['French B (SL)'];
      return `
You're a friendly IB French tutor.
- Respond in natural French
- Greetings get short, simple replies
- Only go deep when asked
`.trim();
    }

    return 'You are a helpful, casual IB tutor. Keep responses natural and conversational.';
  }

  /* =========================
     System prompt builder
  ========================= */
  private buildSystemPrompt(subject: string, mode?: string, language?: string, _opts?: ChatOptions): string {
    const base = this.getSubjectPrime(subject);

    const modeHint = mode && this.MODE_HINTS[mode]
      ? `\n\nCurrent focus: ${mode}. ${this.MODE_HINTS[mode]}`
      : '';

    const conversationRules = `
IMPORTANT CONVERSATION RULES:
- For greetings like "hi/hello/hola/salut" → reply briefly and friendly; DO NOT start a lecture
- Only give detailed explanations for specific academic questions
- Match their tone; be concise for casual chat
- If they seem stuck, offer help without overwhelming
`;

    let languageInstruction = '';
    if (this.isLanguageLearningSubject(subject)) {
      if (this.isSpanishSubject(subject)) {
        languageInstruction = `\n\nResponde en español de forma natural. Si solo te saludan, responde breve (p. ej., "¡Hola! ¿En qué puedo ayudarte hoy?").`;
      } else if (this.isFrenchSubject(subject)) {
        languageInstruction = `\n\nRéponds en français naturellement. Si c'est juste un salut, réponds brièvement (ex: "Salut ! Je peux t’aider avec quoi aujourd’hui ?").`;
      }
    } else if (language && language !== 'en') {
      languageInstruction = `\n\nRespond in ${language} naturally and conversationally.`;
    }

    return base + modeHint + conversationRules + languageInstruction;
  }

  /* =========================
     Model picker (speed-aware)
  ========================= */
  private pickModel(tier: TierKey, _subject?: string, mode?: string, userText?: string): string {
    const len = (userText || '').split(/\s+/).filter(Boolean).length;
    const heavy = ['Exam-Style','Marking','Derive','Mechanism','Close Analysis','Paper 1','Paper 2','Pathway Map'].includes(mode || '');
    if (!heavy && len <= 12) return 'openai/gpt-4o-mini'; // faster for chit-chat
    const key: TierKey = (tier?.toLowerCase() as TierKey) || 'free';
    return this.MODEL_MAP[key] || this.MODEL_MAP.free;
  }

  /* =========================
     Core OpenRouter call
  ========================= */
  private async openrouterChat(model: string, messages: ChatMessage[], temperature = 0.7, max_tokens = 1500) {
    const resp = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'LearnHub - IB AI Tutor'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`AI service error (${resp.status}): ${resp.statusText}${txt ? ` - ${txt}` : ''}`);
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI returned no content.');
    return content as string;
  }

  /* =========================
     Chat entry point
  ========================= */
  async chatWithAI(
    messages: ChatMessage[],
    subject: string,
    tier: TierKey = 'free',
    options: ChatOptions = {},
  ): Promise<string> {
    // Use only a small tail of the history to avoid old-topic bleed
    const context = messages.slice(-40);
    const lastUser = [...context].reverse().find(m => m.role === 'user')?.content || '';

    const system = this.buildSystemPrompt(subject, options.mode, options.language, options);
    const isShort = lastUser.trim().split(/\s+/).filter(Boolean).length <= 12;

    const model = this.pickModel(tier, subject, options.mode, lastUser);
    const temperature = isShort ? 0.6 : (options.temperature ?? 0.8);
    const maxTokens = isShort ? 300 : 1500;

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: system },
      ...context,
    ];

    try {
      return await this.openrouterChat(model, fullMessages, temperature, maxTokens);
    } catch (err) {
      console.error('AI Chat Error:', err);
      throw new Error('Failed to get AI response. Please try again.');
    }
  }

  /* =========================
     Flashcards
  ========================= */
  private extractFlashcardsFromText(text: string): Array<{ question: string; answer: string }> {
    const cards: Array<{ question: string; answer: string }> = [];
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i + 1 < lines.length; i += 2) {
      cards.push({
        question: lines[i].replace(/^\d+\.?\s*/, '').replace(/:$/, '').trim() + (/\?$/.test(lines[i]) ? '' : '?'),
        answer: lines[i + 1],
      });
      if (cards.length >= 12) break;
    }
    return cards;
  }

  async generateFlashcards(
    content: string,
    _subject: string,
    count = 10
  ): Promise<Array<{ question: string; answer: string }>> {
    const systemPrompt = `
Create ${count} flashcards from this content. Be concise and practical.
Output ONLY a JSON array like: [{"question": "What is...?", "answer": "..."}]
No extra text, no markdown, just the JSON.
`.trim();

    const model = this.MODEL_MAP.free;
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ];

    const raw = await this.openrouterChat(model, messages, 0.5, 2000);
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Array<{ question: string; answer: string }>;
      return this.extractFlashcardsFromText(raw);
    } catch {
      return this.extractFlashcardsFromText(raw);
    }
  }

  /* =========================
     Essay marking
  ========================= */
  private getRubricFor(type: string, subject?: string, paperType?: string) {
    if (subject === 'English Lang & Lit') {
      if (paperType?.toLowerCase().includes('paper 1')) {
        return [
          'A. Knowledge and understanding',
          'B. Analysis and evaluation',
          'C. Focus and organization',
          'D. Language',
        ];
      }
      if (paperType?.toLowerCase().includes('paper 2')) {
        return [
          'A. Knowledge and understanding',
          'B. Analysis and evaluation',
          'C. Focus and organization',
          'D. Language',
        ];
      }
    }
    return [
      'A. Knowledge and understanding',
      'B. Analysis and evaluation',
      'C. Focus and organization',
      'D. Language',
    ];
  }

  private buildMarkingSystemPrompt(type: string, subject?: string, paperType?: string) {
    const criteria = this.getRubricFor(type, subject, paperType);
    const criteriaList = criteria.map(c => `- "${c}" (0–5)`).join('\n');

    return `
You are an experienced IB examiner. Mark fairly but don't be unnecessarily harsh.

Respond ONLY with valid JSON (no extra text):
{
  "rubric_scores": { "A. Knowledge and understanding": 3, ... },
  "overall_score": 12,
  "justifications": { "A. Knowledge and understanding": "Clear but needs depth", ... },
  "improvements": ["Add more examples", "Strengthen conclusion"],
  "summary": "Good foundation but needs development",
  "strengths": ["Clear structure", "Good introduction"]
}

Criteria to use:
${criteriaList}

Keep feedback constructive and specific.
`.trim();
  }

  async markEssay(
    content: string,
    type: string,
    subject?: string,
    paperType?: string
  ): Promise<EssayFeedback> {
    const system = this.buildMarkingSystemPrompt(type, subject, paperType);
    const model = this.MODEL_MAP.pro;
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: `Mark this ${type} essay:\n\n${content}` },
    ];

    const raw = await this.openrouterChat(model, messages, 0.2, 4000);

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') throw new Error('Not an object');

      const total = Object.values(parsed.rubric_scores as Record<string, number>)
        .reduce((a: number, b: number) => a + (typeof b === 'number' ? b : 0), 0);

      if (typeof parsed.overall_score !== 'number' || parsed.overall_score <= 0) {
        (parsed as any).overall_score = total;
      }

      return parsed as EssayFeedback;
    } catch {
      return {
        rubric_scores: {
          'A. Knowledge and understanding': 0,
          'B. Analysis and evaluation': 0,
          'C. Focus and organization': 0,
          'D. Language': 0,
        },
        overall_score: 0,
        justifications: {
          'A. Knowledge and understanding': 'Could not parse response.',
          'B. Analysis and evaluation': 'Could not parse response.',
          'C. Focus and organization': 'Could not parse response.',
          'D. Language': 'Could not parse response.',
        },
        improvements: ['Try submitting again - there was a parsing error.'],
        summary: 'Unable to parse feedback. Please try again.',
      };
    }
  }

  /* =========================
     Simple helper
  ========================= */
  async askAI(prompt: string): Promise<{ response: string }> {
    const model = this.MODEL_MAP.free;
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful, casual IB tutor. Keep responses natural and conversational.' },
      { role: 'user', content: prompt },
    ];
    const content = await this.openrouterChat(model, messages, 0.7, 1500);
    return { response: content };
  }
}

export const aiService = new AIService();
