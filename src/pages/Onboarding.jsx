import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Send, Check } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { GENRES, SEED_BOOKS } from '../data/seedBooks'

const STEPS = [
  {
    id: 'welcome',
    message: "Hey! Welcome to BookLoop. I'd love to help you get set up. What brings you here?",
    type: 'multiselect',
    options: ['Learn about a book', 'Discuss ideas', 'Exam prep', 'Book club catch-up', 'Just exploring'],
  },
  {
    id: 'genres',
    message: (answers) => {
      const purpose = answers.welcome?.[0] || 'exploring'
      return `Great — ${purpose.toLowerCase()} is a perfect reason to be here. What genres interest you most?`
    },
    type: 'multiselect',
    options: GENRES,
  },
  {
    id: 'books',
    message: "Any specific books you're curious about? Search below or just skip ahead.",
    type: 'search',
  },
  {
    id: 'name',
    message: (answers) => {
      const genreCount = answers.genres?.length || 0
      return `Almost done! ${genreCount > 0 ? `Loving the ${answers.genres[0]} pick.` : ''} What should we call you?`
    },
    type: 'text',
    placeholder: 'Your name',
  },
  {
    id: 'done',
    message: (answers) => `You're all set, ${answers.name || 'friend'}! Let's find you a great conversation.`,
    type: 'complete',
  },
]

function ChatBubble({ message, isBot, children }) {
  return (
    <div className={`flex gap-3 ${isBot ? '' : 'flex-row-reverse'}`}>
      {isBot && (
        <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center shrink-0">
          <BookOpen size={14} className="text-white" />
        </div>
      )}
      <div className={`max-w-[85%] ${isBot ? '' : 'text-right'}`}>
        {message && (
          <div className={`inline-block rounded-2xl px-4 py-2.5 text-sm
            ${isBot ? 'bg-surface rounded-tl-sm' : 'bg-foreground text-white rounded-tr-sm'}`}>
            {message}
          </div>
        )}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
  )
}

function MultiSelectChips({ options, selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = selected.includes(option)
        return (
          <button
            key={option}
            onClick={() => onToggle(option)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer
              ${isSelected
                ? 'bg-foreground text-white'
                : 'bg-surface border border-border text-muted hover:text-foreground hover:border-foreground/30'
              }`}
          >
            {isSelected && <Check size={14} className="inline mr-1 -mt-0.5" />}
            {option}
          </button>
        )
      })}
    </div>
  )
}

function BookSearchInput({ onSelect, selectedBooks }) {
  const [query, setQuery] = useState('')
  const results = query.length > 0
    ? SEED_BOOKS.filter((b) =>
        b.title.toLowerCase().includes(query.toLowerCase()) ||
        b.author.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5)
    : []

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="text"
          placeholder="Search for a book..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm
            placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-highlight/20 focus:border-highlight"
        />
      </div>
      {results.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          {results.map((book) => (
            <button
              key={book.id}
              onClick={() => { onSelect(book); setQuery('') }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface transition-colors border-b border-border last:border-b-0 cursor-pointer"
            >
              <span className="font-medium">{book.title}</span>
              <span className="text-muted"> — {book.author}</span>
            </button>
          ))}
        </div>
      )}
      {selectedBooks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedBooks.map((book) => (
            <span key={book.id} className="inline-flex items-center gap-1 bg-highlight/10 text-highlight text-xs px-2 py-1 rounded-full">
              {book.title}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center shrink-0">
        <BookOpen size={14} className="text-white" />
      </div>
      <div className="bg-surface rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}

export function Onboarding() {
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [visibleMessages, setVisibleMessages] = useState([])
  const [isTyping, setIsTyping] = useState(true)
  const [textInput, setTextInput] = useState('')
  const [selectedBooks, setSelectedBooks] = useState([])
  const scrollRef = useRef(null)
  const navigate = useNavigate()

  const step = STEPS[currentStep]

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsTyping(false)
      const message = typeof step.message === 'function' ? step.message(answers) : step.message
      setVisibleMessages((prev) => [...prev, { type: 'bot', text: message, stepId: step.id }])
    }, 800)
    return () => clearTimeout(timer)
  }, [currentStep])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visibleMessages, isTyping])

  const advanceStep = (answer) => {
    const newAnswers = { ...answers, [step.id]: answer }
    setAnswers(newAnswers)

    const displayAnswer = Array.isArray(answer) ? answer.join(', ') : typeof answer === 'string' ? answer : ''
    if (displayAnswer) {
      setVisibleMessages((prev) => [...prev, { type: 'user', text: displayAnswer }])
    }

    if (currentStep < STEPS.length - 1) {
      setIsTyping(true)
      setCurrentStep(currentStep + 1)
    }
  }

  const handleMultiSelectContinue = (selected) => {
    if (selected.length > 0) advanceStep(selected)
  }

  const handleTextSubmit = (e) => {
    e.preventDefault()
    if (textInput.trim()) {
      advanceStep(textInput.trim())
      setTextInput('')
    }
  }

  const [multiSelectState, setMultiSelectState] = useState([])

  const toggleMultiSelect = (option) => {
    setMultiSelectState((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option]
    )
  }

  useEffect(() => {
    setMultiSelectState([])
  }, [currentStep])

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col max-w-lg mx-auto">
      <div className="flex-1 px-4 py-6 space-y-4 overflow-y-auto">
        {visibleMessages.map((msg, i) => (
          <ChatBubble key={i} message={msg.text} isBot={msg.type === 'bot'} />
        ))}

        {isTyping && <TypingIndicator />}

        {!isTyping && step.type === 'multiselect' && (
          <div className="pl-11 space-y-3">
            <MultiSelectChips
              options={step.options}
              selected={multiSelectState}
              onToggle={toggleMultiSelect}
            />
            {multiSelectState.length > 0 && (
              <Button size="sm" onClick={() => handleMultiSelectContinue(multiSelectState)}>
                Continue
              </Button>
            )}
          </div>
        )}

        {!isTyping && step.type === 'search' && (
          <div className="pl-11 space-y-3">
            <BookSearchInput
              selectedBooks={selectedBooks}
              onSelect={(book) => setSelectedBooks((prev) =>
                prev.find((b) => b.id === book.id) ? prev : [...prev, book]
              )}
            />
            <Button size="sm" onClick={() => advanceStep(selectedBooks.map((b) => b.title))}>
              {selectedBooks.length > 0 ? 'Continue' : 'Skip for now'}
            </Button>
          </div>
        )}

        {!isTyping && step.type === 'text' && (
          <form onSubmit={handleTextSubmit} className="pl-11 flex gap-2">
            <Input
              placeholder={step.placeholder}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              autoFocus
            />
            <Button type="submit" size="md">
              <Send size={16} />
            </Button>
          </form>
        )}

        {!isTyping && step.type === 'complete' && (
          <div className="pl-11">
            <Button onClick={() => navigate('/')}>
              Start exploring
            </Button>
          </div>
        )}

        <div ref={scrollRef} />
      </div>
    </div>
  )
}
