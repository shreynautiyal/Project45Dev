// src/pages/Upgrade.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Crown, Zap, Trophy, Sparkles, ShieldCheck,
  CheckCircle2, Star, Rocket, Lock, Headphones, ChevronLeft, ChevronRight, Timer
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge as BadgeUI } from '../components/ui/Badge';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';

type PlanKey = 'free' | 'pro' | 'elite';

const PLAN_PRICES: Record<PlanKey, string> = {
  free: '$0',
  pro: '$6',
  elite: '$30',
};

// --- YOUR Ziina share links (test/live as you configured)
const ZIINA_LINKS: Record<'pro' | 'elite', string> = {
  pro: 'https://pay.ziina.com/project45IB/8Ug10UmwO',
  elite: 'https://pay.ziina.com/project45IB/2JjL3wDsc',
};

const FEATURES = [
  { key: 'ai_tutor',     label: 'AI Tutor messages / day', free: '25', pro: 'Unlimited', elite: 'Unlimited + Priority' },
  { key: 'essay_mark',   label: 'Essay marking & full rubric breakdown', free: '3 / month', pro: '30 / month', elite: 'Unlimited + Fast Lane' },
  { key: 'flashcards',   label: 'AI flashcards from notes', free: 'Basic', pro: 'Smart sets + edits', elite: 'Bulk gen + smart tagging' },
  { key: 'planner',      label: 'Revision Planner & Notebook', free: 'Limited', pro: 'Full planner', elite: 'Planner + predictive coach' },
  { key: 'studyarena',   label: 'StudyArena (timers, rooms, leaderboards)', free: 'Join public rooms', pro: 'Create rooms + Pomodoro', elite: 'VIP rooms + advanced analytics' },
  { key: 'analytics',    label: 'Progress analytics & streak boosts', free: 'Basic', pro: 'Detailed', elite: 'Elite Insights + 2× XP events' },
  { key: 'export',       label: 'Exports (PDF/Doc/CSV)', free: 'Watermarked', pro: 'Clean exports', elite: 'Batch exports + templates' },
  { key: 'priority',     label: 'Priority support', free: 'Community', pro: 'Email support', elite: 'Priority support + 1:1 triage' },
] as const;

const TESTIMONIALS = [
  { quote: 'Pro removed the ceiling. My essays jumped a band in two weeks.', name: 'Amirah, IB Eng LangLit SL' },
  { quote: 'Elite analytics showed me exactly why I was stuck at 6s in Paper 1.', name: 'Leo, IB Year 13' },
  { quote: 'StudyArena + Pomodoro turned 4h of chaos into 2.5h of real work.', name: 'Sofia, HL Maths AA' },
  { quote: 'Unlimited marking with actionable edits… It’s like having a coach.', name: 'Ravi, TOK' },
];

function Check({ on = true }: { on?: boolean }) {
  return on ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />;
}

function formatDuration(ms: number) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const hrs = Math.floor(s / 3600).toString().padStart(2, '0');
  const mins = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const secs = Math.floor(s % 60).toString().padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

export default function Upgrade() {
  const navigate = useNavigate();
  const { profile } = useAuthStore() as any;
  const [params, setParams] = useSearchParams();

  // ----- Promo timer
  const paramEnd = params.get('promoEnds');
  const defaultEnd = new Date(Date.now() + 1000 * 60 * 60 * 48);
  const PROMO_END = useMemo(() => (paramEnd ? new Date(paramEnd) : defaultEnd), [paramEnd]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remainingMs = Math.max(0, PROMO_END.getTime() - now);
  const endsSoon = remainingMs > 0;

  // ----- Current plan
  const currentPlan: PlanKey = useMemo(() => {
    const p = (profile?.plan || '').toLowerCase();
    if (p === 'elite') return 'elite';
    if (p === 'pro') return 'pro';
    return 'free';
  }, [profile?.plan]);

  // ----- Redirect to Ziina (no functions; just share links)
  const [loadingPlan, setLoadingPlan] = useState<Exclude<PlanKey, 'free'> | null>(null);
  const goToZiina = useCallback((plan: 'pro' | 'elite') => {
    setLoadingPlan(plan);
    window.location.href = ZIINA_LINKS[plan];
  }, []);

  // ----- Handle return from Ziina
  const [flashMsg, setFlashMsg] = useState<string | null>(null);
  useEffect(() => {
    // Expecting: ?status=success&plan=pro  (set this in each Ziina link's Success URL)
    const status = params.get('status');
    const plan = params.get('plan') as 'pro' | 'elite' | null;

    async function activate(planToSet: 'pro' | 'elite') {
      if (!profile?.id) return;
      const { error } = await supabase
        .from('profiles')
        .update({ plan: planToSet })
        .eq('id', profile.id);
      if (!error) {
        setFlashMsg(`Success! Your account is now on ${planToSet.toUpperCase()}.`);
      } else {
        setFlashMsg('Payment succeeded, but we could not update your plan automatically. Please contact support.');
        console.error('Plan activation error:', error);
      }
    }

    if (status === 'success' && (plan === 'pro' || plan === 'elite')) {
      activate(plan);
      // Clean the URL so refreshes don’t re-trigger
      params.delete('status');
      params.delete('plan');
      setParams(params, { replace: true });
    } else if (status === 'cancelled') {
      setFlashMsg('Checkout cancelled. No changes made.');
      params.delete('status');
      setParams(params, { replace: true });
    }
  }, [params, setParams, profile?.id]);

  // ----- PlanCard
  const PlanCard = ({
    plan, title, price, priceStrike, highlight, tagline, bullets,
    onCheckout, isLoading, ctaHref,
    secureNote = 'Secure checkout via Ziina • Cancel anytime',
  }: {
    plan: PlanKey;
    title: string;
    price: string;
    priceStrike?: string;
    highlight?: boolean;
    tagline: string;
    bullets: string[];
    onCheckout?: () => void;
    isLoading?: boolean;
    ctaHref?: string;
    secureNote?: string;
  }) => {
    const isCurrent = plan === currentPlan;
    return (
      <Card className={highlight ? 'relative border-2 border-amber-400 shadow-lg' : 'relative'}>
        {highlight && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <BadgeUI variant="success" className="px-3">Most Popular</BadgeUI>
          </div>
        )}
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {plan === 'elite' ? <Crown className="h-5 w-5" /> : plan === 'pro' ? <Rocket className="h-5 w-5" /> : <Star className="h-5 w-5" />}
              {title}
            </div>
            <div className="text-right">
              {priceStrike ? <div className="text-xs text-muted-foreground line-through">{priceStrike}/mo</div> : null}
              <div className="text-2xl font-bold">
                {price}<span className="text-sm font-normal text-muted-foreground">/mo</span>
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{tagline}</p>
          <ul className="space-y-2 text-sm">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <Check />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          {isCurrent ? (
            <div className="mt-4">
              <Button variant="secondary" className="w-full" disabled>
                You’re on {title}
              </Button>
              {plan !== 'free' && (
                <div className="mt-2 text-center">
                  <Link to="/billing" className="text-xs text-muted-foreground hover:underline">
                    Manage billing
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4">
              {onCheckout ? (
                <>
                  <Button className="w-full gap-2" onClick={onCheckout} disabled={!!isLoading}>
                    {isLoading ? 'Redirecting…' : <>Continue to Checkout <ArrowRight className="h-4 w-4" /></>}
                  </Button>
                  <div className="mt-2 text-center">
                    <span className="text-xs text-muted-foreground">{secureNote}</span>
                  </div>
                </>
              ) : (
                <>
                  <Link to={ctaHref || '/signup'}>
                    <Button className="w-full gap-2">
                      Continue <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <div className="mt-2 text-center">
                    <span className="text-xs text-muted-foreground">Create a free account</span>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Testimonials carousel
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setSlide((s) => (s + 1) % TESTIMONIALS.length), 5000);
    return () => clearInterval(i);
  }, []);
  const prev = () => setSlide((s) => (s - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);
  const next = () => setSlide((s) => (s + 1) % TESTIMONIALS.length);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Success / cancel flash */}
      {flashMsg && (
        <div className="mb-4 rounded-md border bg-emerald-50 px-4 py-2 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-100">
          {flashMsg}
        </div>
      )}

      {/* Sticky urgency banner */}
      <div className="sticky top-0 z-30 mb-4">
        <div className="rounded-md border bg-amber-50 px-4 py-2 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4" />
            <span className="font-medium">Limited-time upgrade bonus</span>
            <BadgeUI variant="warning">Ends soon</BadgeUI>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span>Pro: <span className="line-through opacity-70">$8</span> <strong>$6</strong> • Elite: <span className="line-through opacity-70">$40</span> <strong>$30</strong></span>
            {endsSoon ? <span className="font-mono">{formatDuration(remainingMs)}</span> : <span className="font-mono">Expired</span>}
          </div>
        </div>
      </div>

      {/* Back + guarantee */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <BadgeUI variant="info" className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Money-safe: cancel anytime
        </BadgeUI>
      </div>

      {/* Hero */}
      <div className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h1 className="text-3xl font-bold tracking-tight">Upgrade your study stack.</h1>
          <p className="mt-2 text-muted-foreground">
            Free is a taste. <strong>Pro</strong> gives you the daily tools you’ll actually use.
            <strong> Elite</strong> turns your prep into a machine—priority marking, unlimited tutor time,
            VIP StudyArena, and analytics that show exactly where to push next.
          </p>

          {/* Why section */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2 font-medium"><Zap className="h-4 w-4" /> Go faster, daily</div>
              <p className="text-sm text-muted-foreground">Unlimited tutor messages and serious review tools. Stop waiting, start shipping progress.</p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2 font-medium"><Trophy className="h-4 w-4" /> Marking that matters</div>
              <p className="text-sm text-muted-foreground">Full rubric breakdowns with actionable edits—so you fix what actually costs marks.</p>
            </div>
            <div className="rounded-lg border p-4">
              <div className="mb-2 flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4" /> Elite edge</div>
              <p className="text-sm text-muted-foreground">VIP rooms, analytics, and priority lanes. When you’re aiming high, friction is the enemy.</p>
            </div>
          </div>
        </div>

        {/* Testimonials card with carousel */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Headphones className="h-5 w-5" /> Students say</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative rounded-md border p-4">
              <p className="text-sm">“{TESTIMONIALS[slide].quote}”</p>
              <div className="mt-2 text-xs text-muted-foreground">— {TESTIMONIALS[slide].name}</div>
              <div className="mt-4 flex items-center justify-between">
                <Button size="sm" variant="secondary" onClick={prev} className="gap-1">
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <div className="flex items-center gap-1">
                  {TESTIMONIALS.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSlide(i)}
                      className={`h-2 w-2 rounded-full ${i === slide ? 'bg-foreground' : 'bg-muted'}`}
                      aria-label={`Go to slide ${i + 1}`}
                    />
                  ))}
                </div>
                <Button size="sm" variant="secondary" onClick={next} className="gap-1">
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">Results vary, but the workflow advantage is real.</div>
          </CardContent>
        </Card>
      </div>

      {/* Pricing cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <PlanCard
          plan="free"
          title="Free"
          price={PLAN_PRICES.free}
          tagline="Great to try things out, limited for real progress."
          bullets={[
            '25 tutor messages / day',
            'Basic flashcards',
            'Join public StudyArena',
          ]}
          ctaHref="/signup"
          secureNote="Create a free account"
        />
        <PlanCard
          plan="pro"
          title="Pro"
          price={PLAN_PRICES.pro}
          priceStrike="$8"
          highlight
          tagline="Everything you need to improve every single day."
          bullets={[
            'Unlimited tutor messages',
            '30 essay marks / month with full rubric',
            'Smart flashcards + edits',
            'Create StudyArena rooms + Pomodoro',
            'Full revision planner + notebook',
            'Detailed progress analytics',
            'Clean exports (PDF/Doc/CSV)',
            'Email support',
          ]}
          onCheckout={() => goToZiina('pro')}
          isLoading={loadingPlan === 'pro'}
        />
        <PlanCard
          plan="elite"
          title="Elite"
          price={PLAN_PRICES.elite}
          priceStrike="$40"
          tagline="The serious advantage for top scores and deadlines."
          bullets={[
            'Unlimited tutor + Priority routing',
            'Unlimited essay marking (Fast Lane)',
            'VIP StudyArena rooms & advanced analytics',
            'Predictive revision coach',
            'Batch exports & pro templates',
            '2× XP events + exclusive flairs',
            'Priority support + 1:1 triage',
          ]}
          onCheckout={() => goToZiina('elite')}
          isLoading={loadingPlan === 'elite'}
        />
      </div>

      {/* Feature comparison table */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold">What you actually get</h2>
        <div className="mt-4 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left">Feature</th>
                <th className="px-4 py-3 text-left">Free</th>
                <th className="px-4 py-3 text-left">Pro</th>
                <th className="px-4 py-3 text-left">Elite</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f, i) => (
                <tr key={f.key} className={i % 2 ? 'bg-muted/20' : ''}>
                  <td className="px-4 py-3 font-medium">{f.label}</td>
                  <td className="px-4 py-3">{f.free}</td>
                  <td className="px-4 py-3">{f.pro}</td>
                  <td className="px-4 py-3">{f.elite}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom CTAs */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button className="flex-1 w-full gap-2" onClick={() => goToZiina('pro')} disabled={loadingPlan === 'pro'}>
            {loadingPlan === 'pro' ? 'Redirecting…' : <>Upgrade to Pro — {PLAN_PRICES.pro}/mo <Rocket className="h-4 w-4" /></>}
          </Button>
          <Button
            variant="secondary"
            className="flex-1 w-full gap-2"
            onClick={() => goToZiina('elite')}
            disabled={loadingPlan === 'elite'}
          >
            {loadingPlan === 'elite' ? 'Redirecting…' : <>Go Elite — {PLAN_PRICES.elite}/mo <Crown className="h-4 w-4" /></>}
          </Button>
        </div>
      </div>

      {/* FAQ / Guarantee */}
      <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>FAQ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="font-medium">Can I cancel anytime?</div>
              <p className="text-muted-foreground">Yes. Subscriptions are month-to-month. Cancel whenever.</p>
            </div>
            <div>
              <div className="font-medium">What if I’m already on Pro?</div>
              <p className="text-muted-foreground">You can upgrade to Elite instantly—billing prorates automatically.</p>
            </div>
            <div>
              <div className="font-medium">Do my existing notes and flashcards carry over?</div>
              <p className="text-muted-foreground">Always. Upgrading only unlocks more power; we don’t lock your work.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> No lock-in</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You keep control. If it doesn’t move the needle, cancel with two clicks.
            Meanwhile, Pro and Elite give you everything Free doesn’t—so you can stop rationing messages and finally focus on results.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
