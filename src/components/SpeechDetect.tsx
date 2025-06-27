import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as speechsdk from 'microsoft-cognitiveservices-speech-sdk';
import axios from 'axios';
import { FaMicrophone, FaStop } from 'react-icons/fa';

const paragraphs = [
    `The cat sat on the mat. The cat looked at the mat and then looked at the hat. The hat was on the mat. The mat was flat. The cat liked the flat mat with the hat on it. The cat did not like the rat, but the cat liked the mat.`,
    `In 2023, the teacher taught the class about planets. The teacher said that planets are round, and planets move around the sun. The class listened to the teacher as the teacher wrote the names of the planets. In 2023, the class also learned that planets have moons, and some planets have many moons.`
];

const normalizeWord = (word: string): string => {
    return word.toLowerCase().replace(/[.,!?;:]/g, '');
};

const SpeechDetect: React.FC = () => {
    const [isListening, setIsListening] = useState(false);
    const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
    const [status, setStatus] = useState<{ message: string; type: 'idle' | 'listening' | 'error' | 'initializing' }>({ message: 'Tap the microphone to begin', type: 'idle' });
    const [finalTranscript, setFinalTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');

    const recognizerRef = useRef<speechsdk.SpeechRecognizer | null>(null);

    const targetWords = useMemo(() => paragraphs[currentParagraphIndex].split(/\s+/).filter(Boolean), [currentParagraphIndex]);
    const spokenTranscript = useMemo(() => `${finalTranscript} ${interimTranscript}`.trim(), [finalTranscript, interimTranscript]);

    const wordStatuses = useMemo(() => {
        const spokenWords = spokenTranscript.split(/\s+/).map(normalizeWord).filter(Boolean);
        const statuses: ('matched' | 'missed' | 'pending')[] = Array(targetWords.length).fill('pending');
        let targetIdx = 0;
        for (const spokenWord of spokenWords) {
            if (targetIdx >= targetWords.length) break;
            for (let i = 0; i <= 2 && targetIdx + i < targetWords.length; i++) {
                if (spokenWord === normalizeWord(targetWords[targetIdx + i])) {
                    for (let j = 0; j < i; j++) statuses[targetIdx + j] = 'missed';
                    statuses[targetIdx + i] = 'matched';
                    targetIdx = targetIdx + i + 1;
                    break;
                }
            }
        }
        return statuses;
    }, [spokenTranscript, targetWords]);

    useEffect(() => {
        return () => { recognizerRef.current?.close(); };
    }, []);

    useEffect(() => {
        setFinalTranscript('');
        setInterimTranscript('');
        setStatus({ message: 'Tap the microphone to begin', type: 'idle' });
    }, [currentParagraphIndex]);

    const handleChangeParagraph = () => {
        if (isListening) return;
        setCurrentParagraphIndex(prev => (prev + 1) % paragraphs.length);
    };

    const startListening = async () => {
        if (isListening) return;
        setFinalTranscript('');
        setInterimTranscript('');
        setStatus({ message: 'Initializing...', type: 'initializing' });

        try {
            const { data: { token, region } } = await axios.get("http://localhost:3001/api/get-speech-token");
            const speechConfig = speechsdk.SpeechConfig.fromAuthorizationToken(token, region);
            speechConfig.speechRecognitionLanguage = 'en-US';
            const audioConfig = speechsdk.AudioConfig.fromDefaultMicrophoneInput();
            const recognizer = new speechsdk.SpeechRecognizer(speechConfig, audioConfig);

            recognizerRef.current = recognizer;
            setIsListening(true);
            setStatus({ message: 'Listening...', type: 'listening' });

            recognizer.recognizing = (s, e) => setInterimTranscript(e.result.text);
            recognizer.recognized = (s, e) => {
                if (e.result.reason === speechsdk.ResultReason.RecognizedSpeech) {
                    setFinalTranscript(prev => `${prev} ${e.result.text}`.trim());
                    setInterimTranscript('');
                }
            };
            recognizer.sessionStopped = () => {
                setStatus({ message: 'Session ended. Tap to go again.', type: 'idle' });
                setIsListening(false);
            };
            recognizer.canceled = (s, e) => {
                setStatus({ message: `Error: ${e.errorDetails}`, type: 'error' });
                console.error(`CANCELED: Reason=${e.reason}, Details=${e.errorDetails}`);
                setIsListening(false);
            };

            recognizer.startContinuousRecognitionAsync();
        } catch (error) {
            console.error("Speech recognition setup error:", error);
            setStatus({ message: 'Failed to connect to speech service.', type: 'error' });
        }
    };

    const stopListening = () => {
        recognizerRef.current?.stopContinuousRecognitionAsync();
    };

    return (
        <div style={styles.page}>
            <style>{
                `
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 10px rgba(220, 53, 69, 0.2); }
          50% { box-shadow: 0 0 25px rgba(220, 53, 69, 0.7); }
        }
      `
            }</style>
            <div style={styles.card}>
                <header style={styles.header}>
                    <h1 style={styles.title}>Speech Karaoke</h1>
                    <button
                        onClick={handleChangeParagraph}
                        disabled={isListening}
                        style={isListening ? { ...styles.changeButton, ...styles.changeButtonDisabled } : styles.changeButton}
                    >
                        Change Paragraph
                    </button>
                </header>

                <main style={styles.paragraphContainer}>
                    {targetWords.map((word, idx) => (
                        <span key={idx} style={{ ...styles.word, ...styles[wordStatuses[idx]] }}>
                            {word + ' '}
                        </span>
                    ))}
                </main>

                <footer style={styles.footer}>
                    <button
                        onClick={isListening ? stopListening : startListening}
                        style={{ ...styles.micButton, ...(isListening ? styles.micButtonListening : {}) }}
                        aria-label={isListening ? 'Stop Listening' : 'Start Listening'}
                    >
                        {isListening ? <FaStop size={28} /> : <FaMicrophone size={28} />}
                    </button>
                    <p style={{ ...styles.statusMessage, ...styles[status.type] }}>
                        {status.message}
                    </p>
                </footer>

                {finalTranscript && (
                    <div style={styles.transcriptContainer}>
                        <strong>Recognized:</strong> {finalTranscript}
                    </div>
                )}
            </div>
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    page: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(to top right, #f4f6f9, #e9edf2)',
        fontFamily: "'Poppins', sans-serif",
        padding: '20px',
    },
    card: {
        width: '95%',
        maxWidth: '750px',
        padding: '30px 40px',
        backgroundColor: '#ffffff',
        borderRadius: '24px',
        boxShadow: '0 15px 40px rgba(0, 0, 0, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: '30px',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        margin: 0,
        color: '#1c2a38',
        fontSize: '1.75rem',
        fontWeight: 600,
    },
    changeButton: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 18px',
        border: '1px solid #ced4da',
        borderRadius: '12px',
        backgroundColor: '#fff',
        color: '#495057',
        fontSize: '0.9rem',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
    },
    changeButtonDisabled: {
        cursor: 'not-allowed',
        backgroundColor: '#e9ecef',
        color: '#adb5bd',
    },
    changeButtonIcon: {
        fontSize: '1.1rem',
    },
    paragraphContainer: {
        border: '1px solid #e9edf2',
        padding: '30px',
        backgroundColor: '#f8f9fa',
        borderRadius: '16px',
        fontSize: '1.4rem',
        lineHeight: '2',
        color: '#343a40',
        minHeight: '200px',
        textAlign: 'left',
    },
    word: { transition: 'color 0.3s ease-in-out, fontWeight 0.3s' },
    pending: { color: '#495057' },
    matched: { color: '#28a745', fontWeight: 600 },
    missed: { color: '#adb5bd', textDecoration: 'line-through' },
    footer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '15px',
    },
    micButton: {
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        border: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        background: 'linear-gradient(145deg, #007bff, #0056b3)',
        boxShadow: '0 8px 15px rgba(0, 123, 255, 0.25)',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
    },
    micButtonListening: {
        background: 'linear-gradient(145deg, #dc3545, #c82333)',
        boxShadow: '0 8px 15px rgba(220, 53, 69, 0.3)',
        animation: 'glow 1.5s infinite',
    },
    statusMessage: {
        margin: 0,
        fontWeight: 500,
        fontSize: '1rem',
        minHeight: '1.5em',
        transition: 'color 0.3s',
    },
    idle: { color: '#6c757d' },
    listening: { color: '#dc3545' },
    error: { color: '#c82333' },
    initializing: { color: '#007bff' },
    transcriptContainer: {
        padding: '15px',
        backgroundColor: '#f8f9fa',
        borderRadius: '12px',
        border: '1px solid #e9edf2',
        color: '#495057',
        fontSize: '0.9rem',
        wordBreak: 'break-word',
        opacity: 1,
        transition: 'opacity 0.5s',
    }
}

export default SpeechDetect;