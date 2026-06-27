export const SEED_BOOKS = [
  { id: '1', title: 'Sapiens', author: 'Yuval Noah Harari', genre: 'History', page_count: 443, description: 'A brief history of humankind — from the cognitive revolution to the scientific revolution and beyond.', cover_url: null },
  { id: '2', title: 'Atomic Habits', author: 'James Clear', genre: 'Self-help', page_count: 320, description: 'Tiny changes, remarkable results. A proven framework for building good habits and breaking bad ones.', cover_url: null },
  { id: '3', title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', genre: 'Psychology', page_count: 499, description: 'A groundbreaking tour of the mind — the two systems that drive the way we think.', cover_url: null },
  { id: '4', title: 'The Psychology of Money', author: 'Morgan Housel', genre: 'Business', page_count: 256, description: 'Timeless lessons on wealth, greed, and happiness through short stories about people\'s relationship with money.', cover_url: null },
  { id: '5', title: 'Zero to One', author: 'Peter Thiel', genre: 'Business', page_count: 224, description: 'Notes on startups, or how to build the future. Every moment in business happens only once.', cover_url: null },
  { id: '6', title: '1984', author: 'George Orwell', genre: 'Fiction', page_count: 328, description: 'A dystopian masterpiece about totalitarianism, surveillance, and the destruction of truth.', cover_url: null },
  { id: '7', title: 'The Alchemist', author: 'Paulo Coelho', genre: 'Fiction', page_count: 197, description: 'A shepherd boy\'s journey to find treasure teaches about listening to your heart and following your dreams.', cover_url: null },
  { id: '8', title: 'Deep Work', author: 'Cal Newport', genre: 'Self-help', page_count: 296, description: 'Rules for focused success in a distracted world. How to produce elite-level work.', cover_url: null },
  { id: '9', title: 'The Lean Startup', author: 'Eric Ries', genre: 'Business', page_count: 336, description: 'How today\'s entrepreneurs use continuous innovation to create radically successful businesses.', cover_url: null },
  { id: '10', title: 'Meditations', author: 'Marcus Aurelius', genre: 'Philosophy', page_count: 254, description: 'The private thoughts of the Roman Emperor — timeless Stoic wisdom on resilience, virtue, and purpose.', cover_url: null },
  { id: '11', title: 'Educated', author: 'Tara Westover', genre: 'Non-fiction', page_count: 334, description: 'A memoir of a woman who grew up in a survivalist family and went on to earn a PhD from Cambridge.', cover_url: null },
  { id: '12', title: 'The Hard Thing About Hard Things', author: 'Ben Horowitz', genre: 'Business', page_count: 304, description: 'Building a business when there are no easy answers — war stories from a Silicon Valley veteran.', cover_url: null },
  { id: '13', title: 'Man\'s Search for Meaning', author: 'Viktor E. Frankl', genre: 'Philosophy', page_count: 184, description: 'A Holocaust survivor\'s account of finding purpose in suffering — the foundation of logotherapy.', cover_url: null },
  { id: '14', title: 'Ikigai', author: 'Héctor García & Francesc Miralles', genre: 'Self-help', page_count: 208, description: 'The Japanese secret to a long and happy life — finding your reason for being.', cover_url: null },
  { id: '15', title: 'The Subtle Art of Not Giving a F*ck', author: 'Mark Manson', genre: 'Self-help', page_count: 224, description: 'A counterintuitive approach to living a good life by choosing what to care about carefully.', cover_url: null },
  { id: '16', title: 'Shoe Dog', author: 'Phil Knight', genre: 'Business', page_count: 400, description: 'The memoir of the creator of Nike — a raw, honest story of how a startup became one of the world\'s most iconic brands.', cover_url: null },
  { id: '17', title: 'A Brief History of Time', author: 'Stephen Hawking', genre: 'Science', page_count: 256, description: 'From the Big Bang to black holes — a landmark volume in science writing about time, space, and the universe.', cover_url: null },
  { id: '18', title: 'Homo Deus', author: 'Yuval Noah Harari', genre: 'History', page_count: 450, description: 'A brief history of tomorrow — exploring what might happen when mythology merges with biotechnology.', cover_url: null },
  { id: '19', title: 'Range', author: 'David Epstein', genre: 'Science', page_count: 352, description: 'Why generalists triumph in a specialized world — the case against early specialization.', cover_url: null },
  { id: '20', title: 'Siddhartha', author: 'Hermann Hesse', genre: 'Fiction', page_count: 152, description: 'A novel about the spiritual journey of self-discovery during the time of the Gautama Buddha.', cover_url: null },
]

export const GENRES = ['Business', 'Self-help', 'Fiction', 'Philosophy', 'Science', 'History', 'Psychology', 'Non-fiction']

export const SEED_NARRATORS = [
  { id: 'n1', name: 'Priya Sharma', bio: 'Voracious reader. 200+ books a year. Love discussing business and psychology.', avatar_url: null, role: 'narrator', book_ids: ['1', '2', '3', '4', '5'] },
  { id: 'n2', name: 'James Chen', bio: 'Philosophy nerd and startup founder. Happy to go deep on any book I\'ve read.', avatar_url: null, role: 'narrator', book_ids: ['5', '9', '10', '12', '13'] },
  { id: 'n3', name: 'Amara Obi', bio: 'English lit graduate. Fiction is my forte — let\'s talk themes, not just plot.', avatar_url: null, role: 'narrator', book_ids: ['6', '7', '11', '20'] },
  { id: 'n4', name: 'Ravi Mehta', bio: 'Data scientist who reads too many self-help books. Ask me anything.', avatar_url: null, role: 'narrator', book_ids: ['2', '8', '14', '15'] },
  { id: 'n5', name: 'Sofia Ruiz', bio: 'Science communicator. I break down complex ideas into dinner-table conversation.', avatar_url: null, role: 'narrator', book_ids: ['1', '3', '17', '18', '19'] },
]
