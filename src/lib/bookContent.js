import { supabase } from './supabase'

// Structured content blocks (headings/paragraphs-with-marks/lists/tables/images) live in
// their own table (book_content_blocks), one row per chapter — deliberately NOT nested
// inside books.chapters, which stays lean (content/sections/title/oneliner) so the admin
// catalog listing and every Split/Generate/Regen write are unaffected by how image/table-
// heavy a book's blocks are. See migration 010 for the full rationale.

export async function saveChapterBlocks(bookId, chapterNumber, blocks) {
  if (!bookId || chapterNumber == null) return
  try {
    await supabase.from('book_content_blocks').upsert({
      book_id: bookId,
      chapter_number: chapterNumber,
      blocks: blocks || [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'book_id,chapter_number' })
  } catch (err) {
    console.error('[bookContent] saveChapterBlocks failed:', err.message)
  }
}

// Fetch one chapter's blocks (e.g. for the live voice session to reference images/tables).
export async function fetchChapterBlocks(bookId, chapterNumber) {
  if (!bookId || chapterNumber == null) return []
  try {
    const { data } = await supabase.from('book_content_blocks')
      .select('blocks')
      .eq('book_id', bookId)
      .eq('chapter_number', chapterNumber)
      .maybeSingle()
    return data?.blocks || []
  } catch (err) {
    console.error('[bookContent] fetchChapterBlocks failed:', err.message)
    return []
  }
}
