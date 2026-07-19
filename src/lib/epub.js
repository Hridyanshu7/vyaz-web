import JSZip from 'jszip'
import { uploadBookAsset } from './bookAssets'
import { saveChapterBlocks } from './bookContent'

function parseXml(str) {
  return new DOMParser().parseFromString(str, 'application/xml')
}

function parseHtml(str) {
  return new DOMParser().parseFromString(str, 'text/html')
}

// Resolve a relative href (as seen inside one xhtml file) against that file's own
// directory in the zip, so `<img src="../images/foo.png">` resolves to the real zip path
// regardless of which subfolder the xhtml file itself lives in.
function resolveZipPath(baseDir, relPath) {
  if (!relPath) return relPath
  if (relPath.startsWith('/')) return relPath.slice(1)
  const parts = (baseDir + relPath).split('/')
  const stack = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

const MARK_TAGS = { B: 'bold', STRONG: 'bold', I: 'italic', EM: 'italic', U: 'underline' }

// Walk the inline children of a block element (p/li/blockquote/heading), preserving
// bold/italic/underline as marks on text spans — instead of flattening to plain text and
// losing all emphasis, which is what the old parser did.
function walkInline(node, marks = []) {
  const spans = []
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      if (child.textContent) spans.push({ text: child.textContent, marks: [...marks] })
    } else if (child.nodeType === 1) {
      const mark = MARK_TAGS[child.tagName]
      const nextMarks = mark && !marks.includes(mark) ? [...marks, mark] : marks
      spans.push(...walkInline(child, nextMarks))
    }
  })
  return spans
}

function spansToText(spans) {
  return spans.map((s) => s.text).join('')
}

const MIME_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
}

// Best-effort EPUB3 page-break detection (epub:type="pagebreak" on a span/div, the
// common convention). Many EPUBs carry NO page markers at all — page numbers are a print
// concept and EPUB text reflows — so this returns null far more often than not. Never
// treat its absence as an error.
function detectPage(el) {
  const epubType = el.getAttribute?.('epub:type')
  if (epubType && /pagebreak/i.test(epubType)) {
    return el.getAttribute('title') || el.textContent?.trim() || null
  }
  return null
}

// Walk one chapter-file's HTML into a structured block array — headings (with real
// level), paragraphs (with inline bold/italic/underline spans), lists, tables (real
// row/cell structure), and images (figure or bare <img>, alt/caption captured). This
// replaces the old htmlToText(), which discarded all of this into one flat string.
// Images are returned with a `zipPath` (resolved against this file's own directory) for
// the caller to extract + upload — this function has no zip access itself.
// EPUB3 structural semantics (epub:type) worth preserving as a `role` on whatever blocks
// come from inside the tagged element — sidebars/tips/notes/practice sections are real
// content, just set apart from the main narrative flow. Not exhaustive; extend as new
// values turn up in real books.
const SEMANTIC_EPUB_TYPES = new Set([
  'sidebar', 'note', 'notice', 'tip', 'warning', 'footnote', 'endnote',
  'annotation', 'case-study', 'example', 'practice', 'pullquote', 'help',
])

function detectRole(el) {
  const epubType = el.getAttribute?.('epub:type')
  if (epubType) {
    const match = epubType.split(/\s+/).find((t) => SEMANTIC_EPUB_TYPES.has(t.toLowerCase()))
    if (match) return match.toLowerCase()
  }
  if (el.tagName === 'ASIDE') return 'sidebar'
  return null
}

function htmlToBlocks(html, baseDir) {
  const doc = parseHtml(html)
  // NOTE: <aside> is deliberately NOT stripped — in real EPUBs it holds genuine content
  // (sidebars, tips, callout boxes), not decoration. Only nav/script/style are removed.
  doc.querySelectorAll('nav, script, style').forEach((el) => el.remove())
  if (!doc.body) return []

  const blocks = []
  let currentPage = null

  const withRole = (obj, role) => (role ? { ...obj, role } : obj)

  // `role` is threaded through recursion (not a mutable running variable, unlike
  // currentPage) so it only applies within the wrapper's own subtree, e.g. an <aside>'s
  // paragraphs get role:'sidebar' but content after the </aside> does not.
  const walk = (root, role = null) => {
    root.childNodes.forEach((node) => {
      if (node.nodeType !== 1) return
      const tag = node.tagName

      const pageHere = detectPage(node)
      if (pageHere) currentPage = pageHere
      const roleHere = detectRole(node) || role

      if (/^H[1-4]$/.test(tag)) {
        const text = node.textContent.trim()
        if (text) blocks.push(withRole({ type: 'heading', level: parseInt(tag[1]), text, page: currentPage }, roleHere))
      } else if (tag === 'P' || tag === 'BLOCKQUOTE') {
        // Some EPUBs embed a lone image inside a <p> instead of a <figure> — treat that
        // as an image block, not an empty/near-empty paragraph.
        const soloImg = node.querySelector('img')
        if (soloImg && !node.textContent.trim()) {
          const src = soloImg.getAttribute('src') || ''
          blocks.push(withRole({ type: 'image', zipPath: resolveZipPath(baseDir, src), alt: soloImg.getAttribute('alt') || null, caption: null, page: currentPage }, roleHere))
        } else {
          const spans = walkInline(node)
          if (spansToText(spans).trim()) blocks.push(withRole({ type: 'paragraph', spans, page: currentPage }, roleHere))
        }
      } else if (tag === 'UL' || tag === 'OL') {
        const items = Array.from(node.querySelectorAll(':scope > li')).map((li) => walkInline(li))
        if (items.length) blocks.push(withRole({ type: 'list', ordered: tag === 'OL', items, page: currentPage }, roleHere))
      } else if (tag === 'TABLE') {
        const rows = Array.from(node.querySelectorAll('tr'))
          .map((tr) => Array.from(tr.querySelectorAll('td, th')).map((cell) => cell.textContent.trim()))
          .filter((r) => r.length)
        if (rows.length) blocks.push(withRole({ type: 'table', rows, page: currentPage }, roleHere))
      } else if (tag === 'FIGURE') {
        const img = node.querySelector('img')
        const caption = node.querySelector('figcaption')?.textContent?.trim() || null
        if (img) {
          const src = img.getAttribute('src') || ''
          blocks.push(withRole({ type: 'image', zipPath: resolveZipPath(baseDir, src), alt: img.getAttribute('alt') || null, caption, page: currentPage }, roleHere))
        }
      } else if (tag === 'IMG') {
        const src = node.getAttribute('src') || ''
        blocks.push(withRole({ type: 'image', zipPath: resolveZipPath(baseDir, src), alt: node.getAttribute('alt') || null, caption: null, page: currentPage }, roleHere))
      } else if (tag === 'SVG') {
        // Real-world EPUBs almost universally use <svg><image xlink:href="cover.jpg"/></svg>
        // as a full-bleed, aspect-ratio-preserving wrapper for a raster cover/titlepage
        // image — not actual vector chart/diagram content (verified across 21 real books,
        // see block-lab/docs/epub-encoding-notes.md §2.8). Detect that shape and emit a
        // normal image block instead, so it flows through the existing image-upload pass
        // below and gets a real assetUrl — the generic 'svg' type has no upload/asset
        // pipeline at all, so a cover-wrapper svg would otherwise always render broken.
        const meaningfulChildren = Array.from(node.children).filter((c) => !['title', 'desc', 'defs', 'style'].includes(c.tagName.toLowerCase()))
        const soleImage = meaningfulChildren.length === 1 && meaningfulChildren[0].tagName.toLowerCase() === 'image' ? meaningfulChildren[0] : null
        if (soleImage) {
          const src = soleImage.getAttribute('href') || soleImage.getAttribute('xlink:href') || ''
          blocks.push(withRole({
            type: 'image',
            zipPath: resolveZipPath(baseDir, src),
            alt: node.querySelector('title')?.textContent?.trim() || null,
            caption: node.querySelector('desc')?.textContent?.trim() || null,
            page: currentPage,
          }, roleHere))
        } else {
          // Inline vector chart/graph markup (not a referenced image file). Captured as its
          // own block type so it isn't silently dropped — no upload/asset pipeline for it
          // yet (unlike <img>), but the raw markup + any embedded <title>/<desc> survive.
          const svgTitle = node.querySelector('title')?.textContent?.trim() || null
          const svgDesc = node.querySelector('desc')?.textContent?.trim() || null
          blocks.push(withRole({ type: 'svg', markup: node.outerHTML, title: svgTitle, desc: svgDesc, page: currentPage }, roleHere))
        }
      } else {
        walk(node, roleHere) // recurse into any wrapper tag (div/section/aside/header/main/etc.)
      }
    })
  }
  walk(doc.body)

  return blocks
}

// Flatten blocks into the plain narratable string the existing voice pipeline expects
// (Split/chunking, prompt assembly) — derived once at parse time so that pipeline keeps
// working unmodified while `blocks` is the new, richer sibling field. Images and tables
// are intentionally excluded — nothing here is narratable verbatim text; the live voice
// session references them separately (see geminiLive.js image/table wiring).
function blocksToNarrationText(blocks) {
  const parts = []
  for (const b of blocks) {
    if (b.type === 'heading') parts.push('#'.repeat(b.level) + ' ' + b.text)
    else if (b.type === 'paragraph') parts.push(spansToText(b.spans).trim())
    else if (b.type === 'list') parts.push(b.items.map((spans) => '- ' + spansToText(spans).trim()).join('\n'))
  }
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Untitled spine files shorter than this are treated as a trailing continuation of the
// PREVIOUS chapter (the multi-file-chapter bug) rather than a new bogus chapter. Above
// this, an untitled file is assumed to be a real chapter the TOC simply didn't enumerate,
// and keeps its own (generically-titled) chapter — safer than risking a silent merge of
// two genuinely separate chapters when a book's TOC is just sparse.
const CONTINUATION_WORD_THRESHOLD = 500
const wordCount = (s) => (s.match(/\S+/g) || []).length

const SKIP_TITLE_RE = /^(table of contents|contents|toc|cover|copyright|dedication|acknowledgements?|about|index|bibliography|glossary|appendix|preface|foreword|introduction to the)$/i

// Look up a file inside the zip, trying the raw path first and falling back to a
// percent-decoded version — some EPUB manifests declare encoded hrefs (e.g.
// "Text%20File.xhtml" for a filename containing a space) while the zip entry itself is
// stored under the literal, decoded name, or vice versa. `required` throws a clear,
// specific error on failure instead of the opaque "Cannot read properties of null
// (reading 'async')" you'd get from calling .async() on a missing lookup; when not
// required, callers get null back and decide how to degrade gracefully.
function getZipFile(zip, path, { required = false, label = '' } = {}) {
  let f = zip.file(path)
  if (!f) {
    try { f = zip.file(decodeURIComponent(path)) } catch { /* malformed % sequence — ignore */ }
  }
  if (!f) {
    // Case-insensitive fallback — some EPUB-authoring tools produce zip entries whose
    // casing doesn't exactly match the spec/manifest (surprisingly common in the wild,
    // e.g. container.xml on some Windows-authored archives). JSZip's own lookup is
    // case-sensitive, so this is a real, recurring source of false "missing file" errors.
    const lower = path.toLowerCase()
    const matchName = Object.keys(zip.files).find((name) => name.toLowerCase() === lower)
    if (matchName) f = zip.file(matchName)
  }
  if (!f && required) {
    const sample = Object.keys(zip.files).slice(0, 10).join(', ')
    throw new Error(`EPUB is missing an expected file: "${path}"${label ? ` (${label})` : ''}. Archive root contains: ${sample}`)
  }
  return f
}

export async function parseEpub(file, bookId) {
  const buffer = await file.arrayBuffer()

  // Valid ZIP archives (and thus EPUBs) begin with the bytes "PK". If not, the
  // file is almost certainly DRM-protected (Adobe/ACSM), corrupted, or not an EPUB.
  const sig = new Uint8Array(buffer.slice(0, 2))
  if (sig[0] !== 0x50 || sig[1] !== 0x4b) {
    throw new Error('Not a valid EPUB — the file is not a ZIP archive. It is likely DRM-protected (Adobe/ACSM) or corrupted. Please use a DRM-free EPUB.')
  }

  let zip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error('Could not open EPUB — the archive may be corrupted or incompletely downloaded.')
  }

  // 0. Detect an optional wrapping folder that some non-standard tools add when
  // re-zipping an EPUB (e.g. compressing the extracted folder itself rather than its
  // contents — a common real-world mistake). A standards-compliant EPUB has
  // META-INF/container.xml at the true zip root; if it's not there, search for it
  // anywhere and treat whatever precedes it as a shared prefix on every path we look up.
  const CONTAINER_SUFFIX = 'META-INF/container.xml'
  const containerEntryName = Object.keys(zip.files).find((name) => {
    const n = name.toLowerCase()
    return n === CONTAINER_SUFFIX.toLowerCase() || n.endsWith('/' + CONTAINER_SUFFIX.toLowerCase())
  })
  if (!containerEntryName) {
    const sample = Object.keys(zip.files).slice(0, 10).join(', ')
    throw new Error(`Not a valid EPUB — no META-INF/container.xml found anywhere in the archive. Root contains: ${sample}`)
  }
  const rootPrefix = containerEntryName.slice(0, containerEntryName.length - CONTAINER_SUFFIX.length)

  // 1. Find OPF path from container.xml
  const containerXml = await zip.file(containerEntryName).async('string')
  const container = parseXml(containerXml)
  const rootfile = container.querySelector('rootfile')
  if (!rootfile) throw new Error('Invalid EPUB: container.xml has no <rootfile> entry.')
  const opfPath = rootPrefix + rootfile.getAttribute('full-path')
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : ''

  // 2. Parse OPF for manifest + spine
  const opfFile = getZipFile(zip, opfPath, { required: true, label: 'OPF package document' })
  const opfXml = await opfFile.async('string')
  const opf = parseXml(opfXml)

  const manifest = {}
  opf.querySelectorAll('manifest item').forEach((item) => {
    manifest[item.getAttribute('id')] = {
      href: opfDir + item.getAttribute('href'),
      mediaType: item.getAttribute('media-type'),
    }
  })
  // Reverse lookup (zip path → declared media type) so image uploads use the EPUB's own
  // declared content-type rather than guessing purely from the file extension.
  const mediaTypeByHref = {}
  Object.values(manifest).forEach((m) => { mediaTypeByHref[m.href] = m.mediaType })

  const spineIds = Array.from(opf.querySelectorAll('spine itemref'))
    .map((ref) => ref.getAttribute('idref'))

  // 3. Parse TOC (nav.xhtml preferred, fallback to toc.ncx)
  const navItem = Object.values(manifest).find(
    (m) => m.mediaType === 'application/xhtml+xml' && m.href.includes('nav')
  )
  const ncxItem = Object.values(manifest).find(
    (m) => m.mediaType === 'application/x-dtbncx+xml'
  )

  // Map href → chapter title from TOC
  const titleMap = {}
  // Only TOP-LEVEL TOC entries start a new chapter — a nested entry (a real book Part's
  // sub-sections, or a "Section II" grouping several numbered chapters beneath it) has its
  // own real title AND its own real spine file, but treating every nesting depth as an equal
  // chapter flattens the book's actual structure into far more "chapters" than a reader would
  // recognize (verified against real books: a 10-real-chapter book was coming out as 30).
  // Nested titles still get merged into their parent chapter's content below — only
  // chapter-boundary treatment is depth-gated, titleMap itself stays flat.
  const topLevelHrefs = new Set()

  // TOC hrefs are relative to wherever the nav/ncx file itself lives, not to the OPF's
  // directory — those differ whenever the nav file sits in a subfolder. Resolving against
  // opfDir alone silently drops the subfolder and titleMap ends up keyed to paths that never
  // match a real spine href.
  if (navItem) {
    const navDir = navItem.href.includes('/') ? navItem.href.substring(0, navItem.href.lastIndexOf('/') + 1) : ''
    const navFile = getZipFile(zip, navItem.href)
    const navHtml = await navFile?.async('string')
    if (navHtml) {
      const nav = parseHtml(navHtml)
      const tocRoot = nav.querySelector('nav[epub\\:type="toc"]') || nav.querySelector('nav')
      const topLevelAnchors = new Set(tocRoot ? Array.from(tocRoot.querySelectorAll(':scope > ol > li > a')) : [])
      nav.querySelectorAll('nav[epub\\:type="toc"] a, nav a').forEach((a) => {
        const rawHref = a.getAttribute('href') || ''
        const href = rawHref.split('#')[0]
        if (!href) return
        const fullHref = resolveZipPath(navDir, href)
        titleMap[fullHref] = a.textContent.trim()
        if (topLevelAnchors.has(a)) topLevelHrefs.add(fullHref)
      })
    }
  } else if (ncxItem) {
    const ncxDir = ncxItem.href.includes('/') ? ncxItem.href.substring(0, ncxItem.href.lastIndexOf('/') + 1) : ''
    const ncxFile = getZipFile(zip, ncxItem.href)
    const ncxXml = await ncxFile?.async('string')
    if (ncxXml) {
      const ncx = parseXml(ncxXml)
      const topLevelNavPoints = new Set(ncx.querySelectorAll('navMap > navPoint'))
      ncx.querySelectorAll('navPoint').forEach((np) => {
        const src = np.querySelector('content')?.getAttribute('src') || ''
        const href = src.split('#')[0]
        const label = np.querySelector('navLabel text')?.textContent?.trim() || ''
        if (label && href) {
          const fullHref = resolveZipPath(ncxDir, href)
          titleMap[fullHref] = label
          if (topLevelNavPoints.has(np)) topLevelHrefs.add(fullHref)
        }
      })
    }
  }

  // 4. Extract chapters from spine — merging untitled continuation files into the
  // previous chapter instead of treating every spine file as its own chapter.
  const chapters = []
  let currentChapter = null
  let number = 1

  // Whether the TOC actually lines up with the spine. When it does, any untitled spine file
  // is a continuation split of the current chapter (production tooling breaking one chapter
  // into several files, only the first of which the TOC points at) — no matter how long, it
  // belongs to the chapter it follows, not a new one. Word-count-based chapter splitting is
  // only a fallback for books whose TOC doesn't resolve against the spine at all. Require at
  // least 2 matches, not just 1 — some real-world EPUBs ship a stale/corrupt TOC where every
  // navPoint's anchor collapses onto a single spine href; a single coincidental match there
  // would wrongly merge the entire rest of the book into it.
  const matchedSpineCount = spineIds.filter((id) => manifest[id] && titleMap[manifest[id].href]).length
  const hasTocMatches = matchedSpineCount >= 2

  for (const id of spineIds) {
    const item = manifest[id]
    if (!item || item.mediaType !== 'application/xhtml+xml') continue

    const file2 = getZipFile(zip, item.href)
    if (!file2) { console.warn('[parseEpub] spine file not found in zip, skipping:', item.href); continue }

    const html = await file2.async('string')
    const itemDir = item.href.includes('/') ? item.href.substring(0, item.href.lastIndexOf('/') + 1) : ''
    const blocks = htmlToBlocks(html, itemDir)
    const narrationText = blocksToNarrationText(blocks)

    if (narrationText.length < 200 && !currentChapter) continue // leading cover/blank page

    const tocTitle = titleMap[item.href]
    const isChapterStart = tocTitle && topLevelHrefs.has(item.href)

    if (isChapterStart && SKIP_TITLE_RE.test(tocTitle)) {
      currentChapter = null // explicit front/back matter — don't accumulate into it
      continue
    }

    if (isChapterStart) {
      if (currentChapter) chapters.push(currentChapter)
      currentChapter = { number, title: tocTitle, oneliner: '', blocks: [...blocks], content: narrationText }
      number++
    } else if (currentChapter && (hasTocMatches || wordCount(narrationText) < CONTINUATION_WORD_THRESHOLD)) {
      // Untitled (or nested-titled) continuation → belongs to the chapter just opened.
      currentChapter.blocks.push(...blocks)
      currentChapter.content += '\n\n' + narrationText
    } else if (!hasTocMatches && narrationText.length >= 200) {
      // Untitled but substantial, AND the TOC doesn't reliably cover the spine → keep it
      // as its own chapter rather than risk silently merging two real chapters.
      if (currentChapter) chapters.push(currentChapter)
      currentChapter = { number, title: `Chapter ${number}`, oneliner: '', blocks: [...blocks], content: narrationText }
      number++
    }
  }
  if (currentChapter) chapters.push(currentChapter)

  // 5. Resolve every image block's zip path into a real, durably-hosted URL. Best-effort
  // per image — a failed extraction/upload leaves assetUrl null (alt/caption text still
  // survive) rather than failing the whole parse.
  for (const ch of chapters) {
    for (const block of ch.blocks) {
      if (block.type !== 'image' || !block.zipPath) continue
      try {
        const imgFile = getZipFile(zip, block.zipPath)
        if (!imgFile) { console.warn('[parseEpub] image not found in zip, skipping:', block.zipPath); block.assetUrl = null; continue }
        const bytes = await imgFile.async('uint8array')
        const ext = block.zipPath.split('.').pop()?.toLowerCase()
        const mimeType = mediaTypeByHref[block.zipPath] || MIME_BY_EXT[ext] || 'image/jpeg'
        block.assetUrl = await uploadBookAsset(bookId, block.zipPath, bytes, mimeType)
      } catch (err) {
        console.error('[parseEpub] image extraction failed for', block.zipPath, err.message)
        block.assetUrl = null
      }
      delete block.zipPath
    }
  }

  // 6. Persist each chapter's blocks to their own table (book_content_blocks), then strip
  // `blocks` off the returned chapters — books.chapters stays lean regardless of how
  // image/table-heavy a book is; see bookContent.js / migration 010 for why.
  for (const ch of chapters) {
    await saveChapterBlocks(bookId, ch.number, ch.blocks)
    delete ch.blocks
  }

  return chapters
}
