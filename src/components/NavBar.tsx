interface NavBarProps {
  locale: 'en' | 'zh'
  theme: 'dark' | 'light'
  onLocaleToggle: () => void
  onThemeToggle: () => void
  onHeartClick: () => void
}

export default function NavBar({
  locale,
  theme,
  onLocaleToggle,
  onThemeToggle,
  onHeartClick,
}: NavBarProps) {
  return (
    <nav className="navbar">
      <div className="navbar-left">
        <button
          className={locale === 'en' ? 'locale-active' : ''}
          onClick={locale !== 'en' ? onLocaleToggle : undefined}
        >
          EN
        </button>
        <button
          className={locale === 'zh' ? 'locale-active' : ''}
          onClick={locale !== 'zh' ? onLocaleToggle : undefined}
        >
          中
        </button>
      </div>
      <div className="navbar-right">
        <button onClick={onThemeToggle}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button className="heart-btn" onClick={onHeartClick}>
          ♥
        </button>
      </div>
    </nav>
  )
}
