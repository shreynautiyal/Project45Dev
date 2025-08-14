// src/services/aiService.ts

/**
 * Ultra-refined AI tutor service (v2)
 * - Robust subject + language detection (handles “FR B HL”, etc.)
 * - Tone-smart prompts (greetings ≠ lectures; concise & friendly)
 * - Optional RAG: ① Supabase pgvector KB → ② fallback “IB docs link fetch” (non-language subjects only)
 * - Safer JSON parsing & graceful fallbacks
 * - Better model selection (speed vs. quality) per task & input length
 * - Citation-aware answers when RAG is used
 * - Backwards compatible with your current app
 *
 * NOTE on link-fetch fallback:
 *  • For Math/Sciences/etc. (non-language subjects) we can fetch official IB/spec links on demand
 *  • Language subjects (Spanish/French) SKIP link-fetch (as requested)
 *  • Backend endpoint expected (default: /api/answer-from-link) – see earlier snippet I gave you
 */

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
  model_answer?: string;
  model_points?: string[];
  model_summary?: string;
}

type TierKey = 'free' | 'pro' | 'elite' | 'premium';

type ChatOptions = {
  mode?: string;
  paperType?: string;
  language?: string;            // force language (e.g., 'es', 'fr')
  temperature?: number;
  regenerate?: boolean;
  course?: 'A' | 'B' | 'Ab Initio';
  level?: 'SL' | 'HL';
  skill?: 'Vocab' | 'Grammar' | 'Reading' | 'Writing' | 'Listening' | 'Speaking';
  cefr?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  /** Retrieval Augmented Generation */
  rag?: {
    enabled?: boolean;          // if true, try to pull context from textbooks/notes (KB)
    topK?: number;              // default 6
    docFilter?: {               // optional filters (e.g., subject/course)
      subject?: string;
      course?: string;
      level?: string;
    };
    /** Fallback to IB-docs link fetch (non-language subjects only) */
    autoLink?: boolean;         // default true
    linkEndpoint?: string;      // default '/api/answer-from-link'
    urls?: string[];            // optional explicit URLs to fetch
    subjectHint?: string;       // extra hint for selecting URLs
  };
};

type ModelAnswerOptions =
  | {
      studentText: string;
      subject: string;
      marks: 4 | 10 | 15;
      questionType?: string;
      commandVerb?: string;
      userId?: string;
      disableForTypes?: Array<'EE' | 'IA'>;
      temperature?: number;
      language?: string;
    }
  | [studentText: string, subject: string, questionType: string, marks: 4 | 10 | 15, commandVerb?: string, userIdOrUndefined?: string];

import { supabase } from '../../lib/supabase';

/** --- Utility types for RAG --- */
type KBChunk = {
  id: string;
  doc_id: string;
  subject?: string | null;
  course?: string | null;
  level?: string | null;
  content: string;
  metadata?: Record<string, any> | null;
  similarity?: number;
};
type KBDoc = {
  id: string;
  title: string;
  subject?: string | null;
  source_url?: string | null;
};

class AIService {
  private apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string;
  private baseURL = 'https://openrouter.ai/api/v1';

  /** Model palette tuned for cost/latency/quality */
  private MODEL_MAP: Record<TierKey, string> = {
    free:   'mistralai/mixtral-8x7b-instruct',
    pro:    'openai/gpt-4o-mini',   // quick + good
    elite:  'openai/gpt-4o',        // best quality
    premium:'openai/gpt-4o-mini',
  };

  /** ===== Subject personalities (concise, friendly, IB-aware) ===== */
  private SUBJECT_PRIMES: Record<string, string> = {
    'Math AA': 'You are a chill IB Math AA tutor. Use LaTeX when helpful. Solve step-by-step, avoid fluff.',
    'Math AI': 'You are a friendly IB Math AI tutor. Emphasize applications and technology. Keep it simple.',
    'English Lang & Lit': 'You are a supportive IB English tutor. Help with structure, evidence, analysis—no waffle.',
    'Economics': 'You are a down-to-earth IB Economics tutor. Use clear diagrams/labels when useful.',
    'Business Management': 'You are a practical IB Business tutor. Tie theory to real companies & decisions.',
    'Chemistry': 'You are a clear IB Chemistry tutor. Explain mechanisms/conditions succinctly.',
    'Physics': 'You are a friendly IB Physics tutor. Build intuition, then formalize. Keep maths neat.',
    'Biology': 'You are an enthusiastic IB Biology tutor. Map processes step-by-step with clarity.',

    // Spanish
    'Spanish Ab Initio': `
Eres un tutor amable de IB Spanish Ab Initio.
- Responde en español muy simple (A1-A2)
- Sé breve y conversacional
- Saludos simples → respuestas simples
`.trim(),
    'Spanish B (SL)': `
Eres un tutor de IB Spanish B (SL).
- Español conversacional (B1)
- Natural y claro; profundiza solo si lo piden
`.trim(),
    'Spanish B (HL)': `
Eres un tutor de IB Spanish B (HL).
- Español natural (B1-B2)
- Conversacional, no formal
`.trim(),
    'Spanish A: Lang & Lit (SL)': `
Eres un tutor de IB Spanish A.
- Responde en español natural
- Análisis solo cuando lo pidan
`.trim(),
    'Spanish A: Lang & Lit (HL)': `
Eres un tutor de IB Spanish A (HL).
- Español natural
- No abrumes con análisis salvo que lo pidan
`.trim(),

    // French
    'French Ab Initio': `
Tu es un tuteur IB French Ab Initio.
- Français très simple (A1-A2)
- Réponses courtes et naturelles
- Salutations simples → réponses simples
`.trim(),
    'French B (SL)': `
Tu es un tuteur IB French B (SL).
- Français conversationnel (B1)
- Naturel et clair; approfondis seulement si on le demande
`.trim(),
    'French B (HL)': `
Tu es un tuteur IB French B (HL).
- Français naturel (B1-B2)
- Conversationnel, pas trop formel
`.trim(),
    'French A: Lang & Lit (SL)': `
Tu es un tuteur IB French A.
- Réponds en français naturellement
- Fais de l’analyse quand on te le demande
`.trim(),
    'French A: Lang & Lit (HL)': `
Tu es un tuteur IB French A (HL).
- Français naturel
- N’inonde pas l’élève de détails inutiles
`.trim(),

    /** Generic fallbacks */
    'French A': `Tu es un tuteur IB French A. Réponds en français naturellement. Salutations → réponses brèves.`.trim(),
    'French B': `Tu es un tuteur IB French B. Français conversationnel (B1-B2). Reste concis.`.trim(),
    'French':   `Tu es un tuteur IB de français. Réponds en français naturel. Ne fais pas un cours si on dit juste « salut ».`.trim(),
    'Spanish':  `Eres un tutor IB de español. Responde en español natural. Sé breve con saludos.`.trim(),
  };

  private MODE_HINTS: Record<string, string> = {
    'Explain': 'Give a clear, simple explanation. Start with intuition, then the formal result.',
    'Worked Example': 'Solve step-by-step. Show reasoning and final check.',
    'Practice': 'Create 5 questions from easy→hard with short answers.',
    'Exam-Style': 'Create 3 exam-style questions with marks and concise model answers.',
    'Marking': 'Mark with IB rubric. Be specific, banded, and evidence-based.',
    'Past Papers Mode': 'You are now in PAST PAPERS MODE. When users ask for past papers, search online for real IB past paper questions from official sources, question banks, or educational websites. Provide text-only questions (avoid diagrams/images/graphs). Include source attribution when possible. Focus on recent IB syllabi.',
    'Proof Sketch': 'Outline key lemmas/ideas; keep it tight.',
    'CAS Tips': 'Show calculator approaches + common pitfalls.',
    'Close Analysis': 'Zoom into language, technique, effect. Quote short evidence.',
    'Paper 1': 'Plan a commentary with structure, thesis, line of argument, and key analysis points.',
    'Paper 2': 'Plan a comparative response (themes, evidence, structure).',
    'Diagrams': 'Include clean diagram descriptions with correct labels.',
    'Derive': 'Derive formula assumptions + steps clearly.',
    'Mechanism': 'Show reaction steps/conditions succinctly.',
    'Calculations': 'Provide calculation practice with units.',
    'Pathway Map': 'Map the process stages, controls, and outcomes.',
    'Vocab Drill': 'Give tight word lists with quick examples & checks.',
    'Roleplay': 'Have a short conversation and give gentle corrections.',
    'Writing': 'Give a focused prompt and a tight sample paragraph.',
  };

  /* =========================
     Subject helpers
  ========================= */
  private normalizeSubject(raw: string) {
    return (raw || '').trim().replace(/\s+/g, ' ');
  }
  private isSpanishSubject(subject: string) {
    const s = subject.toLowerCase();
    return /\b(spanish|español|espanyol|espagnol|espanol)\b/.test(s);
  }
  private isFrenchSubject(subject: string) {
    const s = subject.toLowerCase();
    return /\b(french|francais|français|fr)\b/.test(s); // “FR A HL” etc.
  }
  private isEnglishLangLit(subject: string) {
    return /english\s+(lang|language)/i.test(subject);
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
    const s = subject.toLowerCase().replace(/\s+/g, ' ').trim();

    const level: 'SL'|'HL' | undefined =
      /\bhl\b/.test(s) ? 'HL' :
      /\bsl\b/.test(s) ? 'SL' : undefined;

    let course: 'A'|'B'|'Ab Initio' | undefined;
    if (/ab\s*initio/.test(s)) {
      course = 'Ab Initio';
    } else if (/\b(a|course a)\b/.test(s) || /lang\s*&?\s*lit/.test(s)) {
      course = 'A';
    } else if (/\b(b|course b)\b/.test(s) || /\bb\s*\((sl|hl)\)/.test(s)) {
      course = 'B';
    }
    return { course, level };
  }

  /** Pick the best prime even when subject labels vary wildly */
  private getSubjectPrime(subjectRaw: string): string {
    const subject = this.normalizeSubject(subjectRaw);
    if (this.SUBJECT_PRIMES[subject]) return this.SUBJECT_PRIMES[subject];

    const { course, level } = this.parseCourseAndLevel(subject);

    if (this.isSpanishSubject(subject)) {
      if (course === 'Ab Initio') return this.SUBJECT_PRIMES['Spanish Ab Initio'];
      if (course === 'A') return this.SUBJECT_PRIMES['Spanish A: Lang & Lit (SL)'] || this.SUBJECT_PRIMES['Spanish'];
      if (course === 'B' && level === 'HL') return this.SUBJECT_PRIMES['Spanish B (HL)'];
      if (course === 'B') return this.SUBJECT_PRIMES['Spanish B (SL)'];
      return this.SUBJECT_PRIMES['Spanish'];
    }

    if (this.isFrenchSubject(subject)) {
      if (course === 'Ab Initio') return this.SUBJECT_PRIMES['French Ab Initio'];
      if (course === 'A') return this.SUBJECT_PRIMES['French A'] || this.SUBJECT_PRIMES['French A: Lang & Lit (SL)'];
      if (course === 'B' && level === 'HL') return this.SUBJECT_PRIMES['French B (HL)'];
      if (course === 'B') return this.SUBJECT_PRIMES['French B (SL)'];
      return this.SUBJECT_PRIMES['French'];
    }

    // Default, subject-agnostic IB tutor
    return 'You are a helpful, casual IB tutor. Keep responses natural, concise, and directly useful.';
  }

  /* =========================
     System prompt builders
  ========================= */
  private buildSystemPrompt(subject: string, mode?: string, language?: string, opts?: ChatOptions, ragCitations?: string[]): string {
    const base = this.getSubjectPrime(subject);

    // Include level and course context in the system prompt
    const levelContext = opts?.level ? `\n\nYou are teaching ${subject} at ${opts.level} level.` : '';
    const courseContext = opts?.course ? `\n\nCourse: ${opts.course}` : '';
    const fullSubjectContext = `${base}${levelContext}${courseContext}`;

    const modeHint = mode && this.MODE_HINTS[mode]
      ? `\n\nCurrent focus: ${mode}. ${this.MODE_HINTS[mode]}`
      : '';

    const conversationRules = `
IMPORTANT CONVERSATION RULES:
- For greetings like "hi/hello/hola/salut" → reply briefly and friendly; DO NOT start a lecture
- Only give detailed explanations for specific academic questions
- Match their tone; be concise for casual chat
- Prefer bullet points when listing steps or advice
- Use LaTeX for math when helpful (inline: $...$, block: $$...$$)
- If they seem stuck, offer one clear next step
`.trim();

    const langAuto = this.langCodeFromSubject(subject);
    const lang = language || langAuto;

    let languageInstruction = '';
    if (this.isLanguageLearningSubject(subject)) {
      if (this.isSpanishSubject(subject)) {
        languageInstruction = `\n\nResponde en español natural. Si solo te saludan, responde breve (p. ej., "¡Hola! ¿En qué puedo ayudarte hoy?").`;
      } else if (this.isFrenchSubject(subject)) {
        languageInstruction = `\n\nRéponds en français naturellement. Si c'est juste un salut, réponds brièvement (ex: "Salut ! Je peux t'aider avec quoi aujourd'hui ?").`;
      }
    } else if (lang && lang !== 'en') {
      languageInstruction = `\n\nRespond in ${lang} naturally and conversationally.`;
    }

    const ragNote = ragCitations && ragCitations.length
      ? `\n\nUse the provided context when relevant and include short citations like [${ragCitations.map((_, i) => i + 1).join(', ')}].`
      : '';

    // Prevent image/diagram-demanding tasks when generating past papers
    const visualsGuard = `\nDo not ask for or require images/diagrams/graphs. If a question would require a visual, replace it with a textual alternative or skip.`;
    return [fullSubjectContext, modeHint, conversationRules + visualsGuard, languageInstruction, ragNote].join('\n');
  }

  private buildMarkingSystemPrompt(type: string, subject?: string, paperType?: string) {
    const criteria = this.getRubricFor(type, subject, paperType);
    const criteriaList = criteria.map(c => `- "${c}" (0–5)`).join('\n');

    return `
You are an experienced IB examiner. Mark fairly but do not inflate; be precise and evidence-based.

Return ONLY valid JSON (no extra prose), matching:
{
  "rubric_scores": { "A. Knowledge and understanding": 3, ... },
  "overall_score": 12,
  "justifications": { "A. Knowledge and understanding": "Reason...", ... },
  "improvements": ["Actionable point 1", "Actionable point 2"],
  "summary": "One compact paragraph of overall feedback",
  "strengths": ["Optional positives"]
}

Criteria:
${criteriaList}

Be specific. Cite features from the submission in your rationale. Keep each point concise and useful.
`.trim();
  }

  private buildModelAnswerSystemPrompt(params: {
    subject: string;
    marks: 4 | 10 | 15;
    questionType?: string;
    commandVerb?: string;
    language?: string;
    userPatternNotes?: string[];
    exemplarSnippets?: Array<{ excerpt: string; why_it_scored: string }>;
  }) {
    const { subject, marks, questionType, commandVerb, language, userPatternNotes, exemplarSnippets } = params;

    const exemplarBlock = (exemplarSnippets && exemplarSnippets.length)
      ? `
REFERENCE EXEMPLARS (from high-scoring ${subject} responses):
${exemplarSnippets.slice(0, 3).map((e, i) => `- Ex${i + 1} excerpt: "${e.excerpt}"\n  Why it scored: ${e.why_it_scored}`).join('\n')}
(Do not copy; emulate quality and structure.)
`.trim()
      : 'No exemplar snippets available; follow IB rubric strictly.';

    const userPatterns = (userPatternNotes && userPatternNotes.length)
      ? `\n\nSTUDENT RECURRENT ISSUES TO AVOID:\n- ${userPatternNotes.join('\n- ')}`
      : '';

    const lang = language && language !== 'en'
      ? `\n\nProduce the full response in ${language} with natural, academic tone.`
      : '';

    return `
You are a veteran IB examiner writing an exemplar "model answer" for ${subject}.
Be harsh but fair: mark-justified, concise, and structured exactly as IB expects.

OUTPUT REQUIREMENTS:
- A fully-formed model answer that would achieve full marks for a ${marks}-mark question.
- A bullet list of "marking points" showing how each mark is earned.
- A one-paragraph "model summary" that recaps the core argument/analysis.

STYLE:
- Precise claims, embedded evidence, tight analysis; no filler.
- Mirror ${subject} rubric language and success criteria.
- Paragraphs: claim → evidence → analysis → link-back.
- Clear signposting; cohesive progression.

CONTEXT:
- Question type: ${questionType || 'TextResponse'}
- Command verb: ${commandVerb || 'Discuss'}
- Marks: ${marks}
${exemplarBlock}${userPatterns}${lang}
`.trim();
  }

  /* =========================
     Rubrics
  ========================= */
  private getRubricFor(_type: string, subject?: string, paperType?: string) {
    // Extend per subject/paper as needed
    if (subject === 'English Lang & Lit') {
      if (paperType?.toLowerCase().includes('paper 1')) {
        return ['A. Knowledge and understanding', 'B. Analysis and evaluation', 'C. Focus and organization', 'D. Language'];
      }
      if (paperType?.toLowerCase().includes('paper 2')) {
        return ['A. Knowledge and understanding', 'B. Analysis and evaluation', 'C. Focus and organization', 'D. Language'];
      }
    }
    return ['A. Knowledge and understanding', 'B. Analysis and evaluation', 'C. Focus and organization', 'D. Language'];
  }

  /* =========================
     Model picker (speed/quality aware)
  ========================= */
  private pickModel(tier: TierKey, _subject?: string, mode?: string, userText?: string): string {
    const len = (userText || '').split(/\s+/).filter(Boolean).length;
    const heavy = ['Exam-Style','Marking','Derive','Mechanism','Close Analysis','Paper 1','Paper 2','Pathway Map'].includes(mode || '');
    if (!heavy && len <= 12) return 'openai/gpt-4o-mini'; // snappy for short chat
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
        'X-Title': 'Project 45 - IB AI Tutor'
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`AI service error (${resp.status}): ${resp.statusText}${txt ? ` - ${txt}` : ''}`);
    }

    const data = await resp.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI returned no content.');
    return String(content);
  }

  /* =========================
     RAG (textbooks/notes) via Supabase pgvector
     Tables (example):
       - kb_docs(id uuid, title text, subject text, source_url text)
       - kb_chunks(id uuid, doc_id uuid, subject text, course text, level text, content text, embedding vector)
     RPC expected: match_kb_chunks(query_embedding vector, match_count int, filter jsonb)
  ========================= */
  private async embedForSearch(query: string): Promise<number[] | null> {
    try {
      const resp = await fetch(`${this.baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Project 45 - IB AI Tutor'
        },
        body: JSON.stringify({
          model: 'openai/text-embedding-3-small',
          input: query.slice(0, 2000),
        }),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const vec = data?.data?.[0]?.embedding;
      return Array.isArray(vec) ? vec : null;
    } catch {
      return null;
    }
  }

  private async retrieveContextFromKB(userQuery: string, opts?: ChatOptions): Promise<{ context: string; citations: string[] }> {
    try {
      const embed = await this.embedForSearch(userQuery);
      if (!embed) return { context: '', citations: [] };

      const topK = Math.max(1, Math.min(12, opts?.rag?.topK ?? 6));

      const { data, error } = await supabase.rpc('match_kb_chunks', {
        query_embedding: embed as unknown as number[],
        match_count: topK,
        filter: (opts?.rag?.docFilter ?? null)
      });

      if (error || !data?.length) return { context: '', citations: [] };

      const chunks = data as Array<KBChunk & { title?: string; source_url?: string }>;
      const citations: string[] = [];
      const pieces: string[] = [];

      chunks.forEach((c, idx) => {
        const label = `${idx + 1}${c.title ? `: ${c.title}` : ''}${c.source_url ? ` (${c.source_url})` : ''}`;
        citations.push(label);
        pieces.push(`[${idx + 1}] ${c.content}`);
      });

      const context = pieces.join('\n\n');
      return { context, citations };
    } catch {
      return { context: '', citations: [] };
    }
  }

  /* ========= IB-docs link fallback (non-language subjects only) =========
     - Uses curated links per subject OR urls passed via options.rag.urls
     - Calls your backend /api/answer-from-link (no storage; fetches + extracts in memory)
     - Returns model-grounded answer with (Source #) citations
  ========================================================================= */
  private SUBJECT_LINKS: Record<string, string[]> = {
    // Add/adjust official or public syllabus/spec links you prefer
    'Math AA': [
      // examples (placeholders—replace with your preferred official/public links)
      'https://ibmathsresources.com/wp-content/uploads/2019/08/IB-Maths-Analysis-and-Approaches-Formula-Booklet.pdf',
    ],
    'Math AI': [
      'https://ibmathsresources.com/wp-content/uploads/2019/08/IB-Maths-Applications-and-Interpretation-Formula-Booklet.pdf',
    ],
    'Physics': [
      'https://www.physicsandmathstutor.com/pdf-pages/ib/physics/IB-Physics-Data-Booklet-2016.pdf',
    ],
    'Chemistry': [
      'https://www.ibchem.com/root_pdf/chemistry_data_booklet_chemSLandHL.pdf',
    ],
    'Biology': [
      // add biology guides or data booklets as needed
    ],
    'Economics': [
      // add public guides or syllabus summaries
    ],
    'Business Management': [
      // add public guides or syllabus summaries
    ],
  };

  private pickSubjectLinks(subject: string, override?: string[], hint?: string): string[] {
    if (override?.length) return override;
    const s = this.normalizeSubject(subject);
    for (const key of Object.keys(this.SUBJECT_LINKS)) {
      if (s.toLowerCase().includes(key.toLowerCase())) return this.SUBJECT_LINKS[key];
    }
    // default empty; caller will skip if none
    return [];
  }

  private async answerFromLinkEndpoint(params: {
    url: string;
    question: string;
    subject?: string;
    endpoint?: string; // default '/api/answer-from-link'
  }): Promise<string | null> {
    const { url, question, subject, endpoint = '/api/answer-from-link' } = params;
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, question, subject })
      });
      if (!r.ok) return null;
      const data = await r.json().catch(() => null);
      const answer = data?.answer as string | undefined;
      return answer || null;
    } catch {
      return null;
    }
  }

  /* =========================
     Lightweight "learning" via Supabase
  ========================= */
  private async fetchExemplarSnippets(subject: string, marks: number) {
    try {
      const { data, error } = await supabase
        .from('exemplars')
        .select('excerpt, why_it_scored, score')
        .eq('subject', subject)
        .eq('marks', marks)
        .gte('score', 7)
        .limit(5);
      if (error) throw error;
      return (data || []) as Array<{ excerpt: string; why_it_scored: string }>;
    } catch {
      return [];
    }
  }

  private async fetchUserPatternNotes(userId?: string) {
    if (!userId) return [];
    try {
      const { data, error } = await supabase
        .from('user_patterns')
        .select('pattern, count')
        .eq('user_id', userId)
        .order('count', { ascending: false })
        .limit(6);
      if (!error && data?.length) return data.map((d: any) => d.pattern as string);
    } catch {}

    try {
      const { data, error } = await supabase
        .from('essays')
        .select('feedback')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(6);
      if (error || !data) return [];
      const counts = new Map<string, number>();
      for (const r of data) {
        const imps: string[] = r?.feedback?.improvements || [];
        for (const imp of imps) {
          const key = (imp || '').trim();
          if (!key) continue;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
    } catch {
      return [];
    }
  }

  // Optional: store/update pattern counts after a marking round
  private async updateUserPatternsFromFeedback(userId: string, feedback?: EssayFeedback) {
    if (!userId || !feedback?.improvements?.length) return;
    try {
      for (const imp of feedback.improvements) {
        const upsertRes = await supabase
          .from('user_patterns')
          .upsert({ user_id: userId, pattern: imp, count: 1 }, { onConflict: 'user_id,pattern' });
        if (upsertRes.error) continue;

        try {
          const { error: rpcErr } = await supabase.rpc('bump_pattern_count', {
            p_user_id: userId,
            p_pattern: imp,
          });
          if (rpcErr) {
            // ignore silently; RPC may not exist
          }
        } catch {}
      }
    } catch {}
  }

  /* =========================
     Chat entry point (with optional RAG and IB-docs link fallback)
  ========================= */
  async chatWithAI(
    messages: ChatMessage[],
    subject: string,
    tier: TierKey = 'free',
    options: ChatOptions = {},
  ): Promise<string> {
    const context = messages.slice(-40);
    const lastUser = [...context].reverse().find(m => m.role === 'user')?.content || '';
    const isShort = lastUser.trim().split(/\s+/).filter(Boolean).length <= 12;

    // ① Try KB RAG if enabled
    let ragBlock = '';
    let ragCitations: string[] = [];
    const ragEnabled = Boolean(options?.rag?.enabled && lastUser);
    if (ragEnabled) {
      const { context: ragCtx, citations } = await this.retrieveContextFromKB(lastUser, options);
      ragBlock = ragCtx;
      ragCitations = citations;
    }

    // ② If no KB context AND subject is NOT a language-learning subject,
    //    optionally try link-fetch on demand (autoLink default true).
    if (
      !ragBlock &&
      ragEnabled &&
      !this.isLanguageLearningSubject(subject) &&
      (options.rag?.autoLink ?? true)
    ) {
      const urls = this.pickSubjectLinks(subject, options.rag?.urls, options.rag?.subjectHint);
      const endpoint = options.rag?.linkEndpoint || '/api/answer-from-link';
      for (const url of urls) {
        const ans = await this.answerFromLinkEndpoint({
          url,
          question: lastUser,
          subject,
          endpoint
        });
        if (ans) {
          // Return directly if the backend already produced a grounded answer with citations.
          return ans;
        }
      }
    }

    // Build prompts
    const system = this.buildSystemPrompt(subject, options.mode, options.language, options, ragCitations);
    const model = this.pickModel(tier, subject, options.mode, lastUser);
    const temperature = isShort ? 0.6 : (options.temperature ?? 0.8);
    const maxTokens = isShort ? 500 : 1800;

    const instructionForCitations = ragBlock
      ? `\n\nCONTEXT (use only if relevant; cite like [1], [2]):\n${ragBlock}\n\nWhen you use a fact from context, add a short citation at the end of that sentence.`
      : '';

    // When user requests past papers, prefer textual-only banks and avoid visual questions
    const isPastPapers = /\b(past\s*paper|ppq|question\s*bank|past\s*questions)\b/i.test(lastUser);
    let bankNote = '';
    if (isPastPapers) {
      bankNote = `\n\nRULES FOR PAST PAPERS MODE:\n- Only generate textual questions (no diagrams/images/graphs).\n- Prefer topics that can be fully expressed in text.\n- If needed, adapt any visual-heavy question into a purely textual variant.\n`;
    }

    const fullMessages: ChatMessage[] = [
      { role: 'system', content: system + bankNote },
      ...(ragBlock ? [{ role: 'system', content: instructionForCitations }] as ChatMessage[] : []),
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
  private cleanText(str: string) {
    if (!str) return '';
    return String(str)
      .replace(/```(?:json)?/gi, '')
      .replace(/^\s*[\{\[]\s*|\s*[\}\]]\s*$/g, '')
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .trim();
  }

  private extractFlashcardsFromText(text: string): Array<{ question: string; answer: string }> {
    const cards: Array<{ question: string; answer: string }> = [];
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const qRaw = lines[i].replace(/^\d+\.?\s*/, '').replace(/:$/, '').trim();
      const q = qRaw.endsWith('?') ? qRaw : `${qRaw}?`;
      cards.push({ question: q, answer: lines[i + 1] });
      if (cards.length >= 20) break;
    }
    return cards;
  }

  async generateFlashcards(
    content: string,
    _subject: string,
    count = 10
  ): Promise<Array<{ question: string; answer: string }>> {
    const systemPrompt = `
Create ${count} high-quality flashcards from the user's content.
- Each card MUST be concise and practical.
- Output ONLY valid JSON array: [{"question": "What is...?", "answer": "..."}]
- 1–2 sentences max per answer. No markdown fences, no extra prose.
`.trim();

    const model = this.MODEL_MAP.free;
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: content.slice(0, 6000) },
    ];

    const raw = await this.openrouterChat(model, messages, 0.4, 2000);
    const safe = this.cleanText(raw);

    try {
      const parsed = JSON.parse(safe);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, count).map((c: any) => ({
          question: this.cleanText(c?.question || 'Question?'),
          answer: this.cleanText(c?.answer || 'Answer.'),
        }));
      }
      return this.extractFlashcardsFromText(raw).slice(0, count);
    } catch {
      return this.extractFlashcardsFromText(raw).slice(0, count);
    }
  }

  /* =========================
     Essay marking
  ========================= */
  async markEssay(
    content: string,
    type: string,
    subject?: string,
    paperType?: string,
    userId?: string
  ): Promise<EssayFeedback> {
    const system = this.buildMarkingSystemPrompt(type, subject, paperType);
    const model = this.MODEL_MAP.pro;

    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: `Mark this ${type} essay:\n\n${content}` },
    ];

    const raw = await this.openrouterChat(model, messages, 0.2, 4500);
    const safe = this.cleanText(raw);

    let parsed: EssayFeedback | null = null;
    try {
      const p = JSON.parse(safe);
      if (!p || typeof p !== 'object') throw new Error('Not an object');

      const total = Object.values(p.rubric_scores as Record<string, number>)
        .reduce((a: number, b: number) => a + (typeof b === 'number' ? b : 0), 0);

      if (typeof p.overall_score !== 'number' || p.overall_score <= 0) {
        (p as any).overall_score = total;
      }

      parsed = p as EssayFeedback;
    } catch {
      parsed = {
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

    if (userId && parsed) {
      await this.updateUserPatternsFromFeedback(userId, parsed).catch(() => {});
    }

    return parsed!;
  }

  /* =========================
     Model Answers (text subjects)
  ========================= */
  async generateModelAnswer(
    arg1: ModelAnswerOptions
  ): Promise<{ model_answer: string; marking_points: string[]; summary: string }> {
    let opts: Exclude<ModelAnswerOptions, any[]>;
    if (Array.isArray(arg1)) {
      const [studentText, subject, questionType, marks, commandVerb, userId] = arg1;
      opts = { studentText, subject, marks, questionType, commandVerb, userId };
    } else {
      opts = arg1;
    }

    const {
      studentText,
      subject,
      marks,
      questionType = 'TextResponse',
      commandVerb = 'Discuss',
      userId,
      temperature = 0.3,
      language
    } = opts;

    const [patterns, exemplars] = await Promise.all([
      this.fetchUserPatternNotes(userId),
      this.fetchExemplarSnippets(subject, marks),
    ]);

    const system = this.buildModelAnswerSystemPrompt({
      subject, marks, questionType, commandVerb, language,
      userPatternNotes: patterns, exemplarSnippets: exemplars,
    });

    const userMsg = `
Using the student submission below as thematic grounding, produce a *full-mark* exemplar model answer.

Return ONLY valid JSON with keys:
{
  "model_answer": "full essay/response text",
  "marking_points": ["point 1", "point 2", "..."],
  "summary": "1-paragraph recapitulation"
}

Student submission (for topic grounding, do not quote verbatim):
${studentText}
`.trim();

    const model = this.MODEL_MAP.elite;
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ];

    const raw = await this.openrouterChat(model, messages, temperature, 5200);
    const safe = this.cleanText(raw);

    try {
      const parsed = JSON.parse(safe);
      if (!parsed || typeof parsed !== 'object') throw new Error('Not an object');

      const model_answer = String(parsed.model_answer || '').trim();
      const marking_points = Array.isArray(parsed.marking_points) ? parsed.marking_points.map(String) : [];
      const summary = String(parsed.summary || '').trim();

      if (!model_answer || !summary) throw new Error('Missing fields');

      return { model_answer, marking_points, summary };
    } catch {
      return {
        model_answer:
`Model Answer (fallback):
- Clear thesis aligned to the command term "${commandVerb}".
- Paragraphs with claim → evidence → analysis → link-back structure.
- Cohesive signposting and precise terminology.
- Direct engagement with ${marks}-mark expectations; no filler.`,
        marking_points: [
          'Directly answers the command term with a clear thesis',
          'Uses specific, accurate evidence tied to claims',
          'Explains significance (so what?) after each evidence',
          'Maintains focus and logical progression throughout',
          'Employs precise, subject-appropriate terminology',
        ],
        summary: 'A concise, fully-marked model response constructed to IB criteria when parsing failed.',
      };
    }
  }

  /* =========================
     Simple helper
  ========================= */
  async askAI(prompt: string): Promise<{ response: string }> {
    const model = this.MODEL_MAP.free;
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a helpful, casual IB tutor. Keep responses natural and concise.' },
      { role: 'user', content: prompt },
    ];
    const content = await this.openrouterChat(model, messages, 0.6, 1500);
    return { response: content };
  }
}

export const aiService = new AIService();
