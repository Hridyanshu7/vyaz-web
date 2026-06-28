import enrichedBooks from './books-enriched.json'

export const SEED_BOOKS = enrichedBooks

export const GENRES = [...new Set(enrichedBooks.map((b) => b.genre).filter(Boolean))].sort()

export const SEED_NARRATORS = [
  { id: 'ab9c0e99-4aac-4fc0-a3eb-1153510878d6', name: 'Hridyanshu', bio: 'Founder of Vyaz. Happy to discuss any book on the platform.', avatar_url: null, role: 'both', book_ids: [
    '6751a33c-f1b7-4a75-af87-f9724f45401b', // Sapiens
    '095302ed-a638-4388-9fc3-697d30b14e04', // Atomic Habits
    '07a921c6-0ed7-4ab1-9757-b2115bc6901d', // Thinking Fast and Slow
    '7c211f94-2407-4192-8de0-168bb21fe6a5', // Psychology of Money
    '63f3b687-d59c-48e9-b6bd-14eedab5f100', // Zero to One
  ]},
  { id: 'n2', name: 'Priya Sharma', bio: 'Voracious reader. 200+ books a year. Love discussing business and psychology.', avatar_url: null, role: 'narrator', book_ids: [
    '63f3b687-d59c-48e9-b6bd-14eedab5f100', // Zero to One
    'e0228bcd-d713-4336-a925-38a0b7515e7b', // Lean Startup
    '76d1937e-ff16-46e2-b4b2-964cb53dd0b6', // Meditations
    '18ad526e-5801-4dd5-a8fa-d8c15ac5a18f', // Hard Thing
    'c3475286-3f37-4e80-97f3-9ffbb25350de', // Man's Search
  ]},
  { id: 'n3', name: 'Amara Obi', bio: 'English lit graduate. Fiction is my forte — let\'s talk themes, not just plot.', avatar_url: null, role: 'narrator', book_ids: [
    '6188946b-cf02-448e-8e8f-f56bbe2d1fb5', // 1984
    '5547ba39-c337-4e30-95df-64ab5e669135', // The Alchemist
    '40b2efe3-1252-458f-924d-ba7a3ed4520a', // Educated
    '1c5037af-5a72-4c8c-91cb-b27b878d0c37', // Siddhartha
  ]},
  { id: 'n4', name: 'Ravi Mehta', bio: 'Data scientist who reads too many self-help books. Ask me anything.', avatar_url: null, role: 'narrator', book_ids: [
    '095302ed-a638-4388-9fc3-697d30b14e04', // Atomic Habits
    '042f4fea-0504-4445-b734-7cb13a048858', // Deep Work
    '012083c7-a6d8-4c4d-a1c2-f66f8f05206f', // Ikigai
    '3baa6b77-d321-4d70-a371-348432d81e87', // Subtle Art
  ]},
  { id: 'n5', name: 'Sofia Ruiz', bio: 'Science communicator. I break down complex ideas into dinner-table conversation.', avatar_url: null, role: 'narrator', book_ids: [
    '6751a33c-f1b7-4a75-af87-f9724f45401b', // Sapiens
    '07a921c6-0ed7-4ab1-9757-b2115bc6901d', // Thinking Fast and Slow
    '6150ae5f-876c-448a-b695-b314a5e6edcb', // Brief History of Time
    '7c0858a7-7299-483c-94f2-29e14d69fea5', // Homo Deus
    '46abde83-b866-4a26-a7fe-ddac36ef8827', // Range
  ]},
]
