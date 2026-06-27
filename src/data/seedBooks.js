import enrichedBooks from './books-enriched.json'

export const SEED_BOOKS = enrichedBooks

export const GENRES = [...new Set(enrichedBooks.map((b) => b.genre).filter(Boolean))].sort()

export const SEED_NARRATORS = [
  { id: 'n1', name: 'Priya Sharma', bio: 'Voracious reader. 200+ books a year. Love discussing business and psychology.', avatar_url: null, role: 'narrator', book_ids: ['1', '2', '3', '4', '5'] },
  { id: 'n2', name: 'James Chen', bio: 'Philosophy nerd and startup founder. Happy to go deep on any book I\'ve read.', avatar_url: null, role: 'narrator', book_ids: ['5', '9', '10', '12', '13'] },
  { id: 'n3', name: 'Amara Obi', bio: 'English lit graduate. Fiction is my forte — let\'s talk themes, not just plot.', avatar_url: null, role: 'narrator', book_ids: ['6', '7', '11', '20'] },
  { id: 'n4', name: 'Ravi Mehta', bio: 'Data scientist who reads too many self-help books. Ask me anything.', avatar_url: null, role: 'narrator', book_ids: ['2', '8', '14', '15'] },
  { id: 'n5', name: 'Sofia Ruiz', bio: 'Science communicator. I break down complex ideas into dinner-table conversation.', avatar_url: null, role: 'narrator', book_ids: ['1', '3', '17', '18', '19'] },
]
