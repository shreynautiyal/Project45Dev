import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Brain,
  Trophy,
  MessageCircle,
  Target,
  Users,
  ArrowRight,
  CheckCircle
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

/* ---------------- Modal ---------------- */
function Modal({
  open,
  title,
  children,
  onClose
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1 text-sm text-gray-500 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
        <div className="prose prose-sm max-w-none text-gray-700">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  /* typing animation */
  const phrases = [
    'AI tutor',
    'flashcard maker',
    'essay marking tool',
    'XP & leaderboard',
    'study community'
  ];
  const [text, setText] = useState('');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentPhrase = phrases[phraseIndex];
    let timeout: ReturnType<typeof setTimeout>;

    if (isDeleting) {
      if (charIndex > 0) {
        timeout = setTimeout(() => {
          setText(currentPhrase.substring(0, charIndex - 1));
          setCharIndex(charIndex - 1);
        }, 75);
      } else {
        setIsDeleting(false);
        setPhraseIndex((phraseIndex + 1) % phrases.length);
      }
    } else {
      if (charIndex < currentPhrase.length) {
        timeout = setTimeout(() => {
          setText(currentPhrase.substring(0, charIndex + 1));
          setCharIndex(charIndex + 1);
        }, 150);
      } else {
        timeout = setTimeout(() => setIsDeleting(true), 1000);
      }
    }

    return () => clearTimeout(timeout);
  }, [charIndex, isDeleting, phraseIndex, phrases]);

  const features = [
    {
      icon: Brain,
      title: 'AI-Powered Learning',
      description:
        'Get personalized help from our advanced AI tutor trained specifically for IB subjects.'
    },
    {
      icon: BookOpen,
      title: 'Smart Flashcards',
      description:
        'Create, organize, and study with intelligent flashcards. Auto-generate cards from any topic.'
    },
    {
      icon: Target,
      title: 'Essay Marking',
      description:
        'Submit your essays and get detailed feedback with grades from our AI examiner.'
    },
    {
      icon: Trophy,
      title: 'XP & Leaderboards',
      description:
        'Earn XP, maintain streaks, and compete with friends in our gamified learning system.'
    },
    {
      icon: MessageCircle,
      title: 'Subject Specialists',
      description:
        'Chat with AI tutors specialized in Math, Sciences, Languages, and all IB subjects.'
    },
    {
      icon: Users,
      title: 'Study Community',
      description:
        'Connect with fellow IB students, share progress, and learn together.'
    }
  ];

  const pricingPlans = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      features: ['Basic flashcards', 'AI chat (limited)', 'Progress tracking', 'Community access'],
      cta: 'Get Started',
      popular: false
    },
    {
      name: 'Pro',
      price: '$9.99',
      period: 'month',
      features: [
        'Unlimited flashcards',
        'Unlimited AI chat',
        'Essay marking',
        'Test mode',
        'Advanced analytics',
        'Priority support'
      ],
      cta: 'Start Pro Trial',
      popular: true
    },
    {
      name: 'Elite',
      price: '$19.99',
      period: 'month',
      features: [
        'Everything in Pro',
        'Smart notes organizer',
        'Priority essay marking',
        'Exclusive badges',
        'Early feature access',
        '1-on-1 study sessions'
      ],
      cta: 'Go Elite',
      popular: false
    }
  ];

  /* footer modal state */
  const [modal, setModal] = useState<null | 'about' | 'pricing' | 'contact' | 'terms'>(null);

  const modalContent: Record<
    NonNullable<typeof modal>,
    { title: string; body: React.ReactNode }
  > = {
    about: {
      title: 'About Project 45',
      body: (
        <>
          <p>
            Project 45 is a student-first, AI-powered study platform built for the IB.
            We combine expert-style tutoring, smart flashcards, and essay feedback into a single,
            clean workflow so you can learn faster with less stress.
          </p>
          <ul>
            <li>Built by IB grads and educators</li>
            <li>Real-time tutoring with subject-specialist AIs</li>
            <li>Actionable analytics to keep you on track</li>
          </ul>
        </>
      )
    },
    pricing: {
      title: 'Pricing Overview',
      body: (
        <>
          <p>
            Choose a plan that fits your journey. Free covers the basics. Pro unlocks unlimited
            learning features. Elite adds early access and 1-on-1 sessions.
          </p>
          <p>Cancel anytime. No hidden fees.</p>
        </>
      )
    },
    contact: {
      title: 'Contact Us',
      body: (
        <>
          <p>We’d love to hear from you.</p>
          <p className="font-medium">Email: project.ib45@gmail.com</p>
          <p>Typical response time: within 24 hours.</p>
        </>
      )
    },
    terms: {
      title: 'Terms & Conditions',
      body: (
        <>
          <p>
            By using Project 45 you agree to our fair use policy, student-friendly code of conduct,
            and privacy-forward data practices. This placeholder text can be replaced with your
            legal copy at any time.
          </p>
        </>
      )
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-purple-600">
                <span className="text-sm font-bold text-white">45</span>
              </div>
              <span className="text-xl font-bold text-gray-900">Project 45</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link to="/login" className="font-medium text-gray-600 hover:text-gray-900">
                Sign In
              </Link>
              <Link to="/signup">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="mb-6 text-5xl font-bold text-gray-900 md:text-6xl">
              Meet your{' '}
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                {text}
              </span>
              <span className="ml-1 inline-block h-10 w-1 animate-pulse align-bottom bg-gray-900" />
            </h1>
            <p className="mx-auto mb-8 max-w-3xl text-xl leading-relaxed text-gray-600">
              Project 45 is your ultimate IB companion. Get personalized AI tutoring,
              smart flashcards, essay feedback, and gamified learning that adapts to your pace.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Link to="/signup">
                <Button size="lg" className="px-8 py-4 text-lg">
                  Start Learning Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Button variant="outline" size="lg" className="px-8 py-4 text-lg">
                Watch Demo
              </Button>
            </div>


            {/* Trust Bar */}
            <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { k: '4k+', label: 'Instagram followers' },
                { k: '2M+', label: 'Total views' },
                { k: 'Trusted', label: 'by IB students' }
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-gray-200 bg-white/70 px-5 py-4 text-center"
                >
                  <div className="text-xl font-semibold text-gray-900">{s.k}</div>
                  <div className="text-xs text-gray-500">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Decorative Blobs */}
        <div className="absolute right-0 top-0 -mr-24 -mt-24 h-96 w-96 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 opacity-10 blur-3xl" />
        <div className="absolute bottom-0 left-0 -mb-24 -ml-24 h-96 w-96 rounded-full bg-gradient-to-tr from-orange-400 to-pink-400 opacity-10 blur-3xl" />
      </section>

      {/* Features Section */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold text-gray-900">
              Everything you need to ace the IB
            </h2>
            <p className="mx-auto max-w-2xl text-xl text-gray-600">
              From AI tutoring to gamified learning, we've built the complete toolkit for IB success.
            </p>
          </div>

          {/* Bigger rectangles with more padding */}
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={idx}
                  hover
                  bgClass="bg-transparent"
                  className="rounded-2xl p-8 text-center"
                >
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-500 to-purple-500">
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="mb-3 text-xl font-semibold text-gray-900">{feature.title}</h3>
                  <p className="text-gray-600">{feature.description}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gray-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold text-gray-900">How Project 45 Works</h2>
            <p className="text-xl text-gray-600">Start learning smarter in just three simple steps</p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-green-500 to-emerald-500">
                <span className="text-xl font-bold text-white">1</span>
              </div>
              <h3 className="mb-3 text-xl font-semibold text-gray-900">Sign Up & Choose Subjects</h3>
              <p className="text-gray-600">
                Create your account and select the IB subjects you're studying. Our AI adapts to your curriculum.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-cyan-500">
                <span className="text-xl font-bold text-white">2</span>
              </div>
              <h3 className="mb-3 text-xl font-semibold text-gray-900">Study with AI & Flashcards</h3>
              <p className="text-gray-600">
                Chat with subject-specific AI tutors, create smart flashcards, and get instant help when you need it.
              </p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500">
                <span className="text-xl font-bold text-white">3</span>
              </div>
              <h3 className="mb-3 text-xl font-semibold text-gray-900">Track Progress & Compete</h3>
              <p className="text-gray-600">
                Earn XP, maintain study streaks, and compete with friends on leaderboards to stay motivated.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold text-gray-900">Simple, transparent pricing</h2>
            <p className="text-xl text-gray-600">Choose the plan that's right for your IB journey</p>
          </div>

          {/* Bigger cards + Most Popular outlined */}
          <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
            {pricingPlans.map((plan, idx) => (
              <Card
                key={idx}
                bgClass="bg-transparent"
                className={`relative rounded-2xl p-8 ${
                  plan.popular ? 'ring-2 ring-blue-600 shadow-lg' : 'border border-gray-200'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 transform">
                    <span className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-1 text-sm font-medium text-white">
                      Most Popular
                    </span>
                  </div>
                )}
                <div className="text-center">
                  <h3 className="mb-2 text-2xl font-bold text-gray-900">{plan.name}</h3>
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                    <span className="text-gray-600">/{plan.period}</span>
                  </div>
                  <ul className="mb-8 space-y-3 text-left">
                    {plan.features.map((feat, i) => (
                      <li key={i} className="flex items-center">
                        <CheckCircle className="mr-3 h-5 w-5 text-green-500" />
                        <span className="text-gray-600">{feat}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to="/signup">
                    <Button variant={plan.popular ? 'primary' : 'outline'} className="w-full">
                      {plan.cta}
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-blue-600 to-purple-600 py-24">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-6 text-4xl font-bold text-white">Ready to transform your IB experience?</h2>
          <p className="mb-8 text-xl text-blue-100">
            Join thousands of IB students already using Project 45 to achieve their academic goals.
          </p>
          <Link to="/signup">
            <Button size="lg" variant="secondary" className="px-8 py-4 text-lg">
              Start Learning Today - It's Free!
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer (simplified) */}
      <footer className="bg-gray-900 py-12 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-purple-600">
              <span className="text-sm font-bold text-white">45</span>
            </div>
            <span className="text-xl font-bold">Project 45</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-gray-300">
            <button
              className="hover:text-white"
              onClick={() => setModal('about')}
            >
              About
            </button>
            <button
              className="hover:text-white"
              onClick={() => setModal('pricing')}
            >
              Pricing
            </button>
            <button
              className="hover:text-white"
              onClick={() => setModal('contact')}
            >
              Contact
            </button>
            <button
              className="hover:text-white"
              onClick={() => setModal('terms')}
            >
              Terms & Conditions
            </button>
          </div>

          <div className="mt-8 border-t border-gray-800 pt-8 text-center text-gray-400">
            <p>&copy; 2025 Project 45. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Modals */}
      {modal && (
        <Modal
          open={true}
          title={modalContent[modal].title}
          onClose={() => setModal(null)}
        >
          {modalContent[modal].body}
        </Modal>
      )}
    </div>
  );
}

export default Landing;
