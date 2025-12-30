'use client';

/**
 * Seed Phrase Input Component
 * 12-word BIP-39 mnemonic entry with validation
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { generateMnemonic, validateMnemonic, parseMnemonicInput, joinMnemonicWords } from '@/lib/crypto';
import { RefreshCw, Copy, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import './seed-phrase-input.css';

interface SeedPhraseInputProps {
    onComplete: (phrase: string) => void;
    mode?: 'generate' | 'import';
}

export function SeedPhraseInput({ onComplete, mode: initialMode = 'generate' }: SeedPhraseInputProps) {
    const [mode, setMode] = useState<'generate' | 'import'>(initialMode);
    const [words, setWords] = useState<string[]>(Array(12).fill(''));
    const [generatedPhrase, setGeneratedPhrase] = useState<string>('');
    const [isValid, setIsValid] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [showPhrase, setShowPhrase] = useState(true);
    const [acknowledged, setAcknowledged] = useState(false);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Generate new phrase on mount or when requested
    const handleGenerate = useCallback(() => {
        const phrase = generateMnemonic();
        setGeneratedPhrase(phrase);
        setWords(phrase.split(' '));
        setIsValid(true);
        setError(null);
        setCopied(false);
    }, []);

    useEffect(() => {
        if (mode === 'generate' && !generatedPhrase) {
            handleGenerate();
        }
    }, [mode, generatedPhrase, handleGenerate]);

    // Handle word input change
    const handleWordChange = (index: number, value: string) => {
        const newWords = [...words];
        newWords[index] = value.toLowerCase().trim();
        setWords(newWords);

        // Validate the phrase
        const phrase = joinMnemonicWords(newWords);
        const allFilled = newWords.every((w) => w.length > 0);

        if (allFilled) {
            const valid = validateMnemonic(phrase);
            setIsValid(valid);
            setError(valid ? null : 'Invalid seed phrase. Please check your words.');
        } else {
            setIsValid(false);
            setError(null);
        }
    };

    // Handle paste of entire phrase
    const handlePaste = (e: React.ClipboardEvent) => {
        const pastedText = e.clipboardData.getData('text');
        const pastedWords = parseMnemonicInput(pastedText);

        if (pastedWords.length === 12) {
            e.preventDefault();
            setWords(pastedWords);
            const phrase = joinMnemonicWords(pastedWords);
            const valid = validateMnemonic(phrase);
            setIsValid(valid);
            setError(valid ? null : 'Invalid seed phrase. Please check your words.');
        }
    };

    // Copy to clipboard
    const handleCopy = async () => {
        const phrase = mode === 'generate' ? generatedPhrase : joinMnemonicWords(words);
        await navigator.clipboard.writeText(phrase);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Handle submit
    const handleSubmit = () => {
        if (!isValid || !acknowledged) return;
        const phrase = mode === 'generate' ? generatedPhrase : joinMnemonicWords(words);
        onComplete(phrase);
    };

    // Auto-focus next input on word entry
    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Tab') {
            e.preventDefault();
            if (index < 11) {
                inputRefs.current[index + 1]?.focus();
            }
        } else if (e.key === 'Backspace' && words[index] === '' && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    return (
        <div className="seed-phrase-container">
            {/* Mode toggle */}
            <div className="mode-toggle">
                <button
                    onClick={() => {
                        setMode('generate');
                        setError(null);
                    }}
                    className={mode === 'generate' ? 'active' : ''}
                >
                    Generate New
                </button>
                <button
                    onClick={() => {
                        setMode('import');
                        setWords(Array(12).fill(''));
                        setIsValid(false);
                        setError(null);
                    }}
                    className={mode === 'import' ? 'active' : ''}
                >
                    Import Existing
                </button>
            </div>

            {/* Instructions */}
            <div className="instructions">
                {mode === 'generate' ? (
                    <p>
                        Your 12-word seed phrase is the <strong>only way</strong> to access your notes.
                        Write it down and store it safely. If you lose it, your notes are unrecoverable.
                    </p>
                ) : (
                    <p>
                        Enter your 12-word seed phrase to access your notes.
                        You can paste the entire phrase or type each word.
                    </p>
                )}
            </div>

            {/* Phrase display/input */}
            <div className="phrase-section">
                <div className="phrase-header">
                    <span className="phrase-label">Seed Phrase</span>
                    <div className="phrase-actions">
                        {mode === 'generate' && (
                            <button onClick={handleGenerate} title="Generate new phrase">
                                <RefreshCw size={16} />
                            </button>
                        )}
                        <button onClick={() => setShowPhrase(!showPhrase)} title={showPhrase ? 'Hide' : 'Show'}>
                            {showPhrase ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button onClick={handleCopy} title="Copy to clipboard">
                            {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                        </button>
                    </div>
                </div>

                <div className={`word-grid ${!showPhrase ? 'blurred' : ''}`} onPaste={handlePaste}>
                    {words.map((word, index) => (
                        <div key={index} className="word-input-wrapper">
                            <span className="word-number">{index + 1}</span>
                            <input
                                ref={(el) => { inputRefs.current[index] = el; }}
                                type={showPhrase ? 'text' : 'password'}
                                value={word}
                                onChange={(e) => handleWordChange(index, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(index, e)}
                                placeholder="word"
                                className="word-input"
                                autoComplete="off"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck="false"
                                readOnly={mode === 'generate'}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Error message */}
            {error && (
                <div className="error-message">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {/* Validation status */}
            {isValid && (
                <div className="success-message">
                    <Check size={16} />
                    <span>Valid seed phrase</span>
                </div>
            )}

            {/* Acknowledgment checkbox */}
            <label className="acknowledgment">
                <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                />
                <span>
                    I understand this is my only way to recover my notes. I have saved my seed phrase securely.
                </span>
            </label>

            {/* Continue button */}
            <button
                onClick={handleSubmit}
                disabled={!isValid || !acknowledged}
                className="continue-button"
            >
                Continue to Kakograph
            </button>
        </div>
    );
}

export default SeedPhraseInput;
