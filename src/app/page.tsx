'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { SeedPhraseInput } from '@/components/auth/seed-phrase-input';
import { PinKeypad } from '@/components/auth/pin-keypad';
import { useEffect, useState } from 'react';
import { PenLine, Shield, Wifi, WifiOff, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, authenticate, hasProtectedSession, unlockWithPin, clearSession } = useAuth();
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => { }
  });

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/write');
    }
  }, [isAuthenticated, router]);

  const handleComplete = async (phrase: string) => {
    const success = await authenticate(phrase);
    if (success) {
      router.push('/write');
    }
  };

  const handleUnlockValidation = async (pin: string) => {
    setIsUnlocking(true);
    setError(null);
    // Give UI a moment to show loading
    await new Promise(r => setTimeout(r, 100));

    const success = await unlockWithPin(pin);
    if (success) {
      router.push('/write');
    } else {
      setError('Incorrect PIN');
      setIsUnlocking(false);
    }
  };

  const handleReset = () => {
    setModalConfig({
      isOpen: true,
      title: 'Reset Login Mechanism?',
      description: 'This will remove the Quick Access PIN from this device. You will need your Seed Phrase to log in again.',
      onConfirm: () => {
        clearSession();
        setModalConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--surface-base)' }}>
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--surface-base)', color: 'var(--text-primary)' }}>
      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
        title={modalConfig.title}
        description={modalConfig.description}
        type="confirm"
        onConfirm={modalConfig.onConfirm}
        isDestructive={true}
      />

      {/* Header */}
      <header className="p-6 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <PenLine className="w-8 h-8 text-blue-500" />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
            Kakograph
          </h1>
        </div>
        <p style={{ color: 'var(--text-muted)' }} className="text-sm">Write first, organize later</p>
      </header>

      {/* Features - Hide on mobile if protected session exists to save space */}
      {!hasProtectedSession && (
        <section className="px-6 py-4">
          <div className="max-w-md mx-auto grid grid-cols-3 gap-4 text-center">
            <div className="p-3">
              <Shield className="w-6 h-6 mx-auto mb-2 text-green-500" />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Zero-Knowledge</p>
            </div>
            <div className="p-3">
              <WifiOff className="w-6 h-6 mx-auto mb-2 text-purple-500" />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Works Offline</p>
            </div>
            <div className="p-3">
              <Wifi className="w-6 h-6 mx-auto mb-2 text-blue-500" />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Syncs Securely</p>
            </div>
          </div>
        </section>
      )}

      {/* Main Content */}
      <section className="flex-1 px-4 pb-8 flex justify-center items-center">
        {hasProtectedSession ? (
          // Unlock View
          <div className="w-full max-w-sm">
            <div
              className="rounded-2xl p-6 shadow-xl"
              style={{
                backgroundColor: 'var(--surface-elevated)',
                border: '1px solid var(--border-primary)'
              }}
            >
              <PinKeypad
                onSubmit={handleUnlockValidation}
                loading={isUnlocking}
                error={error || undefined}
                label="Welcome Back"
              />

              <div className="mt-8 text-center">
                <button
                  onClick={handleReset}
                  className="text-xs underline underline-offset-2 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                >
                  Forgot PIN? Use Seed Phrase
                </button>
              </div>
            </div>
          </div>
        ) : (
          // Seed Phrase Input View
          <div className="w-full">
            <SeedPhraseInput onComplete={handleComplete} />
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="p-4 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
        <p>
          Your notes are encrypted with your seed phrase.
          <br />
          We never see your data.
        </p>
      </footer>
    </main>
  );
}

