import { useEffect, useState } from 'react'

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

// Chromium fires beforeinstallprompt (captured here, replayed on tap); iOS
// Safari has no install API, so it gets a text hint instead. Dismiss is
// session-only state — it doesn't need to persist across launches.
export default function InstallHint() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const [standalone, setStandalone] = useState(() => isStandalone())

  useEffect(() => {
    function handleBeforeInstall(e) {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    function handleInstalled() {
      setStandalone(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  async function handleInstallClick() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
  }

  if (standalone || dismissed) return null
  if (!deferredPrompt && !isIOS()) return null

  return (
    <div className="banner">
      {deferredPrompt ? (
        <>
          <span className="banner__text">Install MealCraft for one-tap access, even offline.</span>
          <div className="banner__actions">
            <button type="button" className="btn" onClick={handleInstallClick}>
              Install
            </button>
            <button type="button" className="btn banner__dismiss" onClick={() => setDismissed(true)} aria-label="Dismiss">
              ×
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="banner__text">Install: Share → Add to Home Screen.</span>
          <div className="banner__actions">
            <button type="button" className="btn banner__dismiss" onClick={() => setDismissed(true)} aria-label="Dismiss">
              ×
            </button>
          </div>
        </>
      )}
    </div>
  )
}
