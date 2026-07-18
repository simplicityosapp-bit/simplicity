import { useEffect, useRef, useState } from 'react'
import { SmilePlus } from 'lucide-react'
import { REACTION_EMOJIS } from '../../lib/api/communityMessages'
import { Box, Txt, Btn } from '../../components/ui'

/* The reaction strip under a bubble: existing reactions as toggle chips (emoji +
   count, highlighted when mine), plus an add-react trigger that opens the
   palette. Aggregation is pure — count per emoji and whether I'm in it — over
   the message's embedded community_message_reactions ([{emoji, user_id}]). */
export default function CommunityReactions({ reactions = [], myUserId, onToggle, addLabel }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [flipDown, setFlipDown] = useState(false)
  const wrapRef = useRef(null)

  /* The palette opens UPWARD by default, but the feed is an overflow-clip
     container — near the top of the viewport the upward palette gets sliced off
     and is unreachable. Measure on open and flip it downward when there isn't
     room above. */
  const togglePicker = () => {
    const r = wrapRef.current?.getBoundingClientRect()
    setFlipDown(!!r && r.top < 140)
    setPickerOpen((o) => !o)
  }

  /* Close the palette on an outside click or Escape while it's open. */
  useEffect(() => {
    if (!pickerOpen) return undefined
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setPickerOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setPickerOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [pickerOpen])

  const byEmoji = new Map()
  for (const r of reactions) {
    const e = byEmoji.get(r.emoji) || { count: 0, mine: false }
    e.count += 1
    if (r.user_id === myUserId) e.mine = true
    byEmoji.set(r.emoji, e)
  }
  /* Palette order for the chips; a reaction outside the palette (shouldn't
     happen from this UI, but the DB allows any short emoji) is appended after. */
  const ordered = [
    ...REACTION_EMOJIS.filter((e) => byEmoji.has(e)),
    ...[...byEmoji.keys()].filter((e) => !REACTION_EMOJIS.includes(e)),
  ]

  const toggle = (emoji) => { onToggle(emoji); setPickerOpen(false) }

  return (
    <Box className="cmt-reactions">
      {ordered.map((emoji) => {
        const { count, mine } = byEmoji.get(emoji)
        return (
          <Btn
            key={emoji}
            type="button"
            className={`cmt-reaction${mine ? ' mine' : ''}`}
            onClick={() => onToggle(emoji)}
            aria-pressed={mine}
          >
            <Txt className="cmt-reaction-emoji" aria-hidden="true">{emoji}</Txt>
            <Txt className="cmt-reaction-count">{count}</Txt>
          </Btn>
        )
      })}

      <Box className="cmt-react-add-wrap" ref={wrapRef}>
        <Btn
          type="button"
          className="cmt-react-add"
          onClick={togglePicker}
          aria-label={addLabel}
          aria-expanded={pickerOpen}
        >
          <SmilePlus size={15} strokeWidth={1.7} aria-hidden="true" />
        </Btn>
        {pickerOpen && (
          <Box className={`cmt-react-picker${flipDown ? ' down' : ''}`} role="menu" aria-label={addLabel}>
            {REACTION_EMOJIS.map((emoji) => (
              <Btn
                key={emoji}
                type="button"
                className="cmt-react-pick"
                role="menuitem"
                onClick={() => toggle(emoji)}
                aria-label={emoji}
              >
                {emoji}
              </Btn>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}
