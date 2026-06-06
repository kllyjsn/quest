import { Capacitor } from '@capacitor/core'

export function initCapacitor() {
  if (!Capacitor.isNativePlatform()) return

  const platform = Capacitor.getPlatform()
  document.documentElement.classList.add(`capacitor-${platform}`)

  if (platform === 'android') {
    initAndroid()
  }
}

async function initAndroid() {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setBackgroundColor({ color: '#0b0e11' })
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setOverlaysWebView({ overlay: false })
  } catch {
    // Status bar plugin not available
  }

  try {
    const { App: CapApp } = await import('@capacitor/app')
    CapApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back()
      } else {
        CapApp.exitApp()
      }
    })
  } catch {
    // App plugin not available
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen')
    setTimeout(() => SplashScreen.hide({ fadeOutDuration: 300 }), 1200)
  } catch {
    // Splash screen plugin not available
  }
}
