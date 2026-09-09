import { useMemo, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, Linking } from 'react-native'
import { BookOpen, HelpCircle, ChevronDown, Lightbulb, Search, X, MessageSquarePlus } from 'lucide-react-native'
import {
  getHelpScreen, getGlobalFaq, guideOrder, searchHelp, chapterHits, mgToReadable,
} from '@simplicity/core'
import i18n from '../lib/i18n'
import { colors, space, type } from '../theme/theme'
import { themed } from '../theme/themed'
import Screen from '../components/Screen'
import ScreenHead from '../components/ScreenHead'
import Card from '../components/Card'

/* ════════════════════════════════════════════════════════════════
   HELP — the guide and the FAQ, on the phone.
   ════════════════════════════════════════════════════════════════
   Native port of apps/web's help screen. The manual itself is shared
   (i18n `help`, four languages) and so are the rules about it — reading
   order, the owner-only exclusion, and the search — which live in
   @simplicity/core/domain/help. A chapter order that disagreed between the
   two apps would not fail anywhere; it would just be a different manual.

   Three ways in, because "where is the answer" has three shapes:
     · search — one query across the guide AND the FAQ, for a reader who
       has a question and no idea which of the two lists holds it;
     · the chapter chips — a map of the manual, and of the app;
     · a `screen` param — opens that chapter expanded, so arriving from
       somewhere lands on its chapter rather than on seventeen shut rows.

   One difference from web, and it is not cosmetic: every string goes
   through mgToReadable(). The manual is written with dual-gender merge
   glyphs, which web draws using the Alef MultiGndr font. This app
   deliberately does not load that font — the converted TTF was a suspect
   while a device build was closing instantly on launch — so a glyph here
   has nothing to draw it and renders as a box. The readable slash form is
   what a reader on a phone should get.
   ════════════════════════════════════════════════════════════════ */

const TABS = [
  { key: 'guide', Icon: BookOpen },
  { key: 'faq', Icon: HelpCircle },
]

const T = (k, o) => i18n.t(`settings:${k}`, o)
/* Everything the manual renders passes through here. */
const R = (s) => mgToReadable(String(s || ''))

export default function HelpScreen({ route }) {
  const wanted = route?.params?.screen || null
  const [tab, setTab] = useState('guide')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(() => new Set(wanted ? [wanted] : []))

  const rtl = (i18n.language || '').startsWith('he')
  const align = { textAlign: rtl ? 'right' : 'left' }

  /* Re-resolved when the language changes. The getters read the i18n
     singleton, and App remounts this subtree on languageChanged, so a
     switch rebuilds them rather than leaving the manual in the old one. */
  const chapters = useMemo(
    () => guideOrder().map((key) => ({ key, chapter: getHelpScreen(key) })).filter((c) => c.chapter),
    [],
  )
  const faqCategories = useMemo(() => getGlobalFaq(), [])
  const results = useMemo(
    () => searchHelp(chapters, faqCategories, query),
    [chapters, faqCategories, query],
  )

  const toggle = (key) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  /* A chapter opened from the chip row: expand it and leave search. */
  const jump = (key) => {
    setQuery('')
    setTab('guide')
    setOpen((prev) => new Set(prev).add(key))
  }

  return (
    <Screen name="home">
      <ScreenHead title={T('help.title', { defaultValue: 'עזרה' })} />

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.search, rtl && styles.rowRtl]}>
          <Search size={16} strokeWidth={1.7} color={colors.textFaint} />
          <TextInput
            style={[styles.searchInput, align]}
            value={query}
            onChangeText={setQuery}
            placeholder={T('help.search.placeholder')}
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={T('help.search.aria')}
            returnKeyType="search"
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={T('help.search.clear')}
              onPress={() => setQuery('')}
              hitSlop={10}
            >
              <X size={15} strokeWidth={2} color={colors.textSub} />
            </Pressable>
          ) : null}
        </View>

        {/* While a query is live the two lists stop being two lists: each
            result says where it came from, which is the only thing the
            tabs were carrying. */}
        {!results.active ? (
          <View style={styles.tabs}>
            {TABS.map(({ key, Icon }) => {
              const on = tab === key
              return (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={[styles.tab, on && styles.tabOn]}
                  onPress={() => setTab(key)}
                >
                  <Icon size={15} strokeWidth={1.7} color={on ? colors.onBrand : colors.text} />
                  <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{T(`help.tabs.${key}`)}</Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}

        {results.active
          ? <Results results={results} query={query} align={align} onJump={jump} />
          : tab === 'guide'
            ? <Guide chapters={chapters} open={open} onToggle={toggle} onJump={jump} align={align} rtl={rtl} />
            : <Faq categories={faqCategories} open={open} onToggle={toggle} align={align} rtl={rtl} />}

        {/* Under every state of this screen, "nothing found" included — the
            exact moment a reader decides the app has no answer for them. */}
        <Card>
          <Text style={[styles.contactTitle, align]}>{T('help.contact.title')}</Text>
          <Text style={[styles.contactBody, align]}>{T('help.contact.body')}</Text>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.contactCta, rtl && styles.rowRtl, pressed && styles.pressed]}
            /* There is no feedback surface in this app yet, so the way to
               reach a person is the web app — the same treatment the legal
               pages already get in Settings, rather than a button that
               apologises. */
            onPress={() => Linking.openURL('https://simplicity-os.com/help').catch(() => {})}
          >
            <MessageSquarePlus size={16} strokeWidth={1.7} color={colors.onBtn} />
            <Text style={styles.contactCtaLabel}>{T('help.contact.cta')}</Text>
          </Pressable>
        </Card>
      </ScrollView>
    </Screen>
  )
}

/* ── Search results ─────────────────────────────────────────────── */

function Results({ results, query, align, onJump }) {
  if (results.count === 0) {
    return (
      <View style={styles.none}>
        <Text style={[styles.noneTitle, align]}>{T('help.search.none', { query })}</Text>
        <Text style={[styles.noneBody, align]}>{T('help.search.noneHint')}</Text>
      </View>
    )
  }

  return (
    <View style={styles.section}>
      <Text style={[styles.count, align]}>{T('help.search.results', { count: results.count })}</Text>

      {results.guide.length > 0 ? (
        <>
          <Text style={[styles.where, align]}>{T('help.search.inGuide')}</Text>
          {results.guide.map((c) => (
            <Card key={c.key}>
              <Text style={[styles.chapterTitle, align]}>{R(c.title)}</Text>
              <Body chapter={c} align={align} />
              <Pressable accessibilityRole="button" onPress={() => onJump(c.key)}>
                <Text style={[styles.openChapter, align]}>{T('help.search.openChapter')}</Text>
              </Pressable>
            </Card>
          ))}
        </>
      ) : null}

      {results.faq.length > 0 ? (
        <>
          <Text style={[styles.where, align]}>{T('help.search.inFaq')}</Text>
          {results.faq.map((cat, ci) => (
            <Card key={ci}>
              <Text style={[styles.chapterTitle, align]}>{R(cat.category)}</Text>
              {cat.items.map((item, i) => <QA key={i} item={item} align={align} />)}
            </Card>
          ))}
        </>
      ) : null}
    </View>
  )
}

/* ── Shared pieces ──────────────────────────────────────────────── */

function QA({ item, align }) {
  return (
    <View style={styles.qa}>
      <Text style={[styles.q, align]}>{R(item.q)}</Text>
      <Text style={[styles.a, align]}>{R(item.a)}</Text>
    </View>
  )
}

function Body({ chapter, align, rtl }) {
  return (
    <>
      {chapter.intro ? <Text style={[styles.intro, align]}>{R(chapter.intro)}</Text> : null}
      {(chapter.features || []).map((f, i) => (
        <View key={i} style={styles.feature}>
          <Text style={[styles.featureTitle, align]}>{R(f.title)}</Text>
          <Text style={[styles.featureBody, align]}>{R(f.body)}</Text>
        </View>
      ))}
      {(chapter.tips || []).length > 0 ? (
        <View style={styles.tips}>
          {chapter.tips.map((tip, i) => (
            <View key={i} style={[styles.tip, rtl && styles.rowRtl]}>
              <Lightbulb size={15} strokeWidth={1.7} color={colors.amberWarn} />
              <Text style={[styles.tipText, align]}>{R(tip)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {(chapter.faq || []).map((item, i) => <QA key={i} item={item} align={align} />)}
    </>
  )
}

/* ── The guide ──────────────────────────────────────────────────── */

function Guide({ chapters, open, onToggle, onJump, align, rtl }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.intro, align]}>{T('about.guideIntro')}</Text>

      {/* A map of the manual. Chips rather than a list because seventeen
          rows of nothing but titles is the thing this replaces. */}
      <View style={styles.chips}>
        {chapters.map(({ key, chapter }) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: open.has(key) }}
            style={[styles.chip, open.has(key) && styles.chipOn]}
            onPress={() => onJump(key)}
          >
            <Text style={[styles.chipLabel, open.has(key) && styles.chipLabelOn]}>{R(chapter.title)}</Text>
          </Pressable>
        ))}
      </View>

      {chapters.map(({ key, chapter }) => {
        const isOpen = open.has(key)
        return (
          <Card key={key}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              style={[styles.disclosure, rtl && styles.rowRtl]}
              onPress={() => onToggle(key)}
            >
              <Text style={[styles.chapterTitle, styles.grow, align]}>{R(chapter.title)}</Text>
              <ChevronDown
                size={16}
                strokeWidth={1.7}
                color={colors.textSub}
                style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
              />
            </Pressable>
            {isOpen ? <Body chapter={chapter} align={align} rtl={rtl} /> : null}
          </Card>
        )
      })}
    </View>
  )
}

function Faq({ categories, open, onToggle, align, rtl }) {
  return (
    <View style={styles.section}>
      {/* Which of the two lists this is. Every chapter of the guide carries
          its own questions as well, and nothing said so: a reader with a
          question had two places to look and no way to tell them apart. */}
      <Text style={[styles.intro, align]}>{T('help.faqIntro')}</Text>
      {categories.map((cat, ci) => (
        <Card key={ci}>
          <Text style={[styles.chapterTitle, align]}>{R(cat.category)}</Text>
          {(cat.items || []).map((item, i) => {
            const id = `faq:${ci}:${i}`
            const isOpen = open.has(id)
            return (
              <View key={i}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  style={[styles.disclosure, rtl && styles.rowRtl]}
                  onPress={() => onToggle(id)}
                >
                  <Text style={[styles.q, styles.grow, align]}>{R(item.q)}</Text>
                  <ChevronDown
                    size={15}
                    strokeWidth={1.7}
                    color={colors.textSub}
                    style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
                  />
                </Pressable>
                {isOpen ? <Text style={[styles.a, align]}>{R(item.a)}</Text> : null}
              </View>
            )
          })}
        </Card>
      ))}
    </View>
  )
}

const styles = themed((c, t) => ({
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: space.screenPadH, paddingBottom: 96, gap: 12 },
  rowRtl: { flexDirection: 'row-reverse' },
  grow: { flex: 1 },
  pressed: { opacity: 0.75 },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.card,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: c.text },

  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.cardFlat,
  },
  tabOn: { backgroundColor: c.brand, borderColor: c.brand },
  tabLabel: { fontSize: 14, color: c.text },
  tabLabelOn: { color: c.onBrand, fontWeight: '600' },

  section: { gap: 12 },
  intro: { ...t.caption, color: c.textSub },
  count: { ...t.micro, color: c.textFaint },
  where: { ...t.caption, color: c.textSub, marginTop: 4 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.cardFlat,
  },
  chipOn: { borderColor: c.brand, backgroundColor: c.brandSoft },
  chipLabel: { fontSize: 13, color: c.text },
  chipLabelOn: { color: c.brand, fontWeight: '600' },

  disclosure: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  chapterTitle: { ...t.heading, color: c.text },

  feature: { gap: 3, marginTop: 10 },
  featureTitle: { ...t.body, color: c.text, fontWeight: '600' },
  featureBody: { ...t.caption, color: c.textSub, lineHeight: 20 },

  tips: { gap: 8, marginTop: 12 },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  tipText: { ...t.caption, color: c.textSub, flex: 1, lineHeight: 20 },

  qa: { gap: 3, marginTop: 12 },
  q: { ...t.body, color: c.text, fontWeight: '600' },
  a: { ...t.caption, color: c.textSub, lineHeight: 20, paddingBottom: 8 },

  openChapter: { ...t.caption, color: c.brand, marginTop: 10 },

  none: { gap: 6, paddingVertical: 24 },
  noneTitle: { ...t.heading, color: c.text },
  noneBody: { ...t.caption, color: c.textSub },

  contactTitle: { ...t.heading, color: c.text },
  contactBody: { ...t.caption, color: c.textSub, marginTop: 4, marginBottom: 12, lineHeight: 20 },
  contactCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: c.btnBg,
  },
  contactCtaLabel: { ...t.body, color: c.onBtn },
}))
