import { ref } from 'vue'

export type GlitchLicenseStatus = 'pending' | 'ok' | 'denied'

export const glitchLicenseStatus = ref<GlitchLicenseStatus>('pending')
