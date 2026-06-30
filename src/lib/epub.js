import JSZip from 'jszip'

function parseXml(str) {
  return new DOMParser().parseFromString(str, 'application/xml')
}

function parseHtml(str) {
  return new DOMParser().parseFromString(str, 'text/html')
}

function htmlToText(html) {
  const doc = parseHtml(html)

  // Remove nav, aside, script, style
  doc.querySelectorAll('nav, aside, script, style, figure, figcaption').forEach((el) => el.remove())

  // Convert headings to markdown
  doc.querySelectorAll('h1,h2,h3,h4').forEach((el) => {
    const level = parseInt(el.tagName[1])
    el.textContent = '\n' + '#'.repeat(level) + ' ' + el.textContent.trim() + '\n'
  })

  // Paragraphs → double newline
  doc.querySelectorAll('p').forEach((el) => {
    el.textContent = el.textContent.trim() + '\n\n'
  })

  // List items
  doc.querySelectorAll('li').forEach((el) => {
    el.textContent = '- ' + el.textContent.trim() + '\n'
  })

  const text = doc.body?.textContent || ''
  return text
    .replace(/\n{3,}/g, '\n\n')  // collapse excess blank lines
    .trim()
}

export async function parseEpub(file) {
  const buffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)

  // 1. Find OPF path from container.xml
  const containerXml = await zip.file('META-INF/container.xml').async('string')
  const container = parseXml(containerXml)
  const opfPath = container.querySelector('rootfile').getAttribute('full-path')
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : ''

  // 2. Parse OPF for manifest + spine
  const opfXml = await zip.file(opfPath).async('string')
  const opf = parseXml(opfXml)

  const manifest = {}
  opf.querySelectorAll('manifest item').forEach((item) => {
    manifest[item.getAttribute('id')] = {
      href: opfDir + item.getAttribute('href'),
      mediaType: item.getAttribute('media-type'),
    }
  })

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

  if (navItem) {
    const navHtml = await zip.file(navItem.href)?.async('string')
    if (navHtml) {
      const nav = parseHtml(navHtml)
      nav.querySelectorAll('nav[epub\\:type="toc"] a, nav a').forEach((a) => {
        const rawHref = a.getAttribute('href') || ''
        const href = rawHref.split('#')[0]
        const fullHref = href.startsWith('/') ? href.slice(1) : (opfDir + href)
        titleMap[fullHref] = a.textContent.trim()
      })
    }
  } else if (ncxItem) {
    const ncxXml = await zip.file(ncxItem.href)?.async('string')
    if (ncxXml) {
      const ncx = parseXml(ncxXml)
      ncx.querySelectorAll('navPoint').forEach((np) => {
        const src = np.querySelector('content')?.getAttribute('src') || ''
        const href = opfDir + src.split('#')[0]
        const label = np.querySelector('navLabel text')?.textContent?.trim() || ''
        if (label) titleMap[href] = label
      })
    }
  }

  // 4. Extract chapters from spine
  const chapters = []
  let number = 1

  for (const id of spineIds) {
    const item = manifest[id]
    if (!item || item.mediaType !== 'application/xhtml+xml') continue

    const file = zip.file(item.href)
    if (!file) continue

    const html = await file.async('string')
    const content = htmlToText(html)

    // Skip very short entries (cover, TOC page, copyright)
    if (content.length < 200) continue

    const title = titleMap[item.href] || `Chapter ${number}`

    // Skip nav/toc entries
    if (/^(table of contents|contents|toc|cover|copyright|dedication|acknowledgements?|about|index|bibliography|glossary|appendix|preface|foreword|introduction to the)$/i.test(title)) continue

    chapters.push({ number, title, oneliner: '', content })
    number++
  }

  return chapters
}
