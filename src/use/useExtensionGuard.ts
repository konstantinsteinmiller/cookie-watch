import { onMounted } from 'vue'

export const useExtensionGuard = () => {
  onMounted(() => {
    // 1. Add a meta tag to signal 'already dark'
    if (!document.querySelector('meta[name="color-scheme"]')) {
      const meta = document.createElement('meta')
      meta.name = 'color-scheme'
      meta.content = 'dark only'
      document.head.appendChild(meta)
    }

    // 2. Detect and Disable common Dark Mode extension stylesheets
    const disableExtensionStyles = () => {
      const sheets = document.styleSheets
      for (let i = 0; i < sheets.length; i++) {
        try {
          const sheet = sheets[i]!
          // Look for keywords extensions use in their generated IDs/Classes
          if (sheet.ownerNode instanceof HTMLElement) {
            const id = sheet.ownerNode.id || ''
            if (id.includes('dark-reader') || id.includes('native-dark')) {
              sheet.disabled = true
            }
          }
        } catch (e) {
          // Cross-origin issues might trigger here, we just skip
        }
      }
    }

    // Run immediately and again after a short delay to catch late injections
    disableExtensionStyles()
    setTimeout(disableExtensionStyles, 1000)
    setTimeout(disableExtensionStyles, 3000)
  })
}