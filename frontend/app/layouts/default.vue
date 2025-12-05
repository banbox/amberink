<script setup lang="ts">
const { locale, locales, setLocale } = useI18n()
const switchLocalePath = useSwitchLocalePath()
const { t } = useI18n()

const availableLocales = computed(() => {
  return locales.value.filter((l) => typeof l !== 'string')
})
</script>

<template>
  <div class="flex min-h-screen flex-col bg-gray-50">
    <!-- Header -->
    <header class="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <!-- Logo / Brand -->
        <NuxtLink to="/" class="flex items-center gap-2">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <svg class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <span class="text-xl font-bold text-gray-900">DBlog</span>
        </NuxtLink>

        <!-- Right side: Language switcher + Wallet -->
        <div class="flex items-center gap-4">
          <!-- Language Switcher -->
          <div class="relative">
            <div class="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
              <NuxtLink
                v-for="loc in availableLocales"
                :key="loc.code"
                :to="switchLocalePath(loc.code)"
                class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                :class="locale === loc.code
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'"
              >
                {{ loc.code === 'en' ? 'EN' : '中' }}
              </NuxtLink>
            </div>
          </div>

          <!-- Wallet Button -->
          <WalletButton />
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="border-t border-gray-200 bg-white">
      <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div class="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <!-- Left: Brand & Description -->
          <div class="flex items-center gap-2 text-gray-600">
            <div class="flex h-6 w-6 items-center justify-center rounded bg-blue-600">
              <svg class="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span class="text-sm">{{ t('tagline') }}</span>
          </div>

          <!-- Center: Links -->
          <nav class="flex items-center gap-6 text-sm text-gray-500">
            <a href="https://github.com" target="_blank" rel="noopener" class="hover:text-gray-900 transition-colors">
              GitHub
            </a>
            <a href="#" class="hover:text-gray-900 transition-colors">
              {{ t('docs') }}
            </a>
            <a href="#" class="hover:text-gray-900 transition-colors">
              {{ t('about') }}
            </a>
          </nav>

          <!-- Right: Copyright -->
          <p class="text-sm text-gray-400">
            © {{ new Date().getFullYear() }} DBlog. {{ t('rights_reserved') }}
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>
