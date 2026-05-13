import { useState, useEffect, useCallback } from 'react'
import './App.css'
import './resume.css'
import NavBar from './components/NavBar'
import Resume from './components/Resume'
import GameApp from './Game'
import { en } from './data/en'
import { zh } from './data/zh'

export default function App() {
  const [locale, setLocale] = useState<'en' | 'zh'>(() =>
    (localStorage.getItem('locale') as 'en' | 'zh') || 'en'
  )
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('theme') as 'dark' | 'light') || 'dark'
  )
  const [showGame, setShowGame] = useState(() => window.location.hash.startsWith('#game'))
  const [transitioning, setTransitioning] = useState(false)

  const data = locale === 'en' ? en : zh

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('locale', locale)
  }, [locale])

  useEffect(() => {
    const onHashChange = () => {
      setShowGame(window.location.hash.startsWith('#game'))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const toggleLocale = useCallback(() => {
    setLocale((prev) => (prev === 'en' ? 'zh' : 'en'))
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  const handleHeartClick = useCallback(() => {
    setTransitioning(true)
    setTimeout(() => {
      window.location.hash = '#game'
      setTransitioning(false)
    }, 300)
  }, [])

  const handleBackClick = useCallback(() => {
    setTransitioning(true)
    setTimeout(() => {
      history.replaceState(null, '', window.location.pathname)
      setShowGame(false)
      setTransitioning(false)
    }, 300)
  }, [])

  if (showGame) {
    return (
      <div className={`game-wrapper ${transitioning ? 'page-exit' : 'page-enter'}`}>
        <button className="game-back-btn" onClick={handleBackClick}>
          {data.labels.back}
        </button>
        <div className="game-content">
          <div className="game-title">For my loves</div>
          <GameApp />
        </div>
      </div>
    )
  }

  return (
    <div className={transitioning ? 'page-exit' : 'page-enter'}>
      <NavBar
        locale={locale}
        theme={theme}
        onLocaleToggle={toggleLocale}
        onThemeToggle={toggleTheme}
        onHeartClick={handleHeartClick}
      />
      <Resume data={data} />
    </div>
  )
}
