import { useState, useEffect } from 'react'
import type { ResumeData } from '../data/types'

interface HeaderProps {
  data: ResumeData
}

function useTypewriter(text: string, speed = 50): string {
  const [displayed, setDisplayed] = useState('')
  useEffect(() => {
    setDisplayed('')
    let i = 0
    const timer = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) clearInterval(timer)
    }, speed)
    return () => clearInterval(timer)
  }, [text, speed])
  return displayed
}

export default function Header({ data }: HeaderProps) {
  const tagline = useTypewriter(data.tagline, 40)
  const isTyping = tagline.length < data.tagline.length

  return (
    <header className="header">
      <h1 className="header-name">{data.name}</h1>
      <p className="header-tagline">
        {tagline}
        {isTyping && <span className="cursor">|</span>}
      </p>
      <div className="header-contact">
        <span>{data.contact.email}</span>
        <span className="dot"> · </span>
        <a
          href={`https://${data.contact.linkedin}`}
          target="_blank"
          rel="noreferrer"
        >
          {data.contact.linkedin}
        </a>
        <span className="dot"> · </span>
        <span>{data.contact.location}</span>
      </div>
    </header>
  )
}
