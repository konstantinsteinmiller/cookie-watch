<template lang="pug">
  FReward(
    :modelValue="modelValue"
    :showContinue="canContinue"
    @continue="handleClose"
  )
    template(#ribbon)
      h2.text-2xl.font-black.text-white.uppercase.italic.brawl-text(
        class="md:text-4xl"
      ) {{ t('congratulations') }}
      span.text-4xl.mb-2(class="md:text-6xl") 🏆
    div.flex.flex-col.items-center.justify-center.max-w-2xl.text-center.p-8.text-shadow(
      class="gap-6 mx-4"
    )

      p.text-white.font-bold.leading-relaxed(
        class="text-lg md:text-2xl"
      ) {{ message }}

      //- Visual timer indicator
      div.w-full.h-1.rounded-full.overflow-hidden(v-if="!canContinue" class="bg-white/10")
        div.h-full.bg-yellow-500.transition-all.duration-100(
          :style="{ width: `${progress}%` }"
        )
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FReward from '@/components/atoms/FReward.vue'
import useSound from '@/use/useSound'

const props = defineProps<{
  modelValue: boolean
  type: 'campaign' | 'demo-campaign' | 'cards'
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t } = useI18n()
const { playSound } = useSound()
const canContinue = ref(false)
const progress = ref(0)

const message = computed(() => {
  return props.type === 'campaign'
    ? t('campaignFinished')
    : props.type === 'demo-campaign'
      ? t('demoCampaignFinished')
      : t('cardsFinished')
})

const startTimer = () => {
  canContinue.value = false
  progress.value = 0

  const duration = 5000
  const interval = 50
  const step = (interval / duration) * 100

  const timer = setInterval(() => {
    progress.value += step
    if (progress.value >= 100) {
      clearInterval(timer)
      canContinue.value = true
    }
  }, interval)
}

watch(() => props.modelValue, (newVal) => {
  if (newVal) startTimer()
})

onMounted(() => {
  if (props.modelValue) startTimer()
  playSound('win', 0.1)
})

const handleClose = () => {
  emit('close')
}
</script>

<style scoped lang="sass">
.brawl-text
  text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000
</style>

<i18n>
en:
  congratulations: "Congratulations!"
  demoCampaignFinished: "You have finished the demo campaign! If you like the game I would like to get some constructive feedback on what you like and what not. The full version will be released soon."
  campaignFinished: "You have finished the campaign! Congratulations! You are a worthy card tactician! But have you collected every card yet? Only the best trading card collectors achieve this ultimate goal!"
  cardsFinished: "Congratulations! You have collected every card. You are the greatest card collector of all time!"
de:
  congratulations: "Glückwunsch!"
  demoCampaignFinished: "Du hast die Demo-Kampagne beendet! Wenn dir das Spiel gefällt, würde ich mich über konstruktives Feedback freuen, was dir gefällt und was nicht. Die Vollversion wird bald veröffentlicht."
  campaignFinished: "Du hast die Kampagne beendet! Glückwunsch! Du bist ein würdiger Kartentaktiker! Aber hast du schon jede Karte gesammelt? Nur die besten Trading-Card-Sammler erreichen dieses ultimative Ziel!"
  cardsFinished: "Glückwunsch! Du hast jede Karte gesammelt. Du bist der größte Kartensammler aller Zeiten!"
fr:
  congratulations: "Félicitations!"
  demoCampaignFinished: "Vous avez terminé la campagne de démo ! Si vous aimez le jeu, j'aimerais recevoir vos commentaires constructifs. La version complète sortira bientôt."
  campaignFinished: "Vous avez terminé la campagne ! Félicitations ! Vous êtes un digne tacticien des cartes ! Mais avez-vous déjà collectionné toutes les cartes ? Seuls les meilleurs collectionneurs atteignent cet objectif ultime !"
  cardsFinished: "Félicitations ! Vous avez collectionné toutes les cartes. Vous êtes le plus grand collectionneur de tous les temps !"
es:
  congratulations: "¡Felicitaciones!"
  demoCampaignFinished: "¡Has terminado la campaña de demostración! Si te gusta el juego, me gustaría recibir comentarios constructivos. La versión completa se lanzará pronto."
  campaignFinished: "¡Has terminado la campaña! ¡Felicitaciones! ¡Eres un digno táctico de cartas! ¿Pero ya has coleccionado todas las cartas? ¡Solo los mejores coleccionistas logran este objetivo final!"
  cardsFinished: "¡Felicitaciones! Has coleccionado todas las cartas. ¡Eres el mejor coleccionista de cartas de todos los tiempos!"
jp:
  congratulations: "おめでとうございます！"
  demoCampaignFinished: "デモキャンペーンをクリアしました！ゲームが気に入ったら、フィードバックをお願いします。製品版はまもなくリリースされます。"
  campaignFinished: "キャンペーンをクリアしました！おめでとうございます！あなたは立派なカードタクティシャンです！しかし、すべてのカードをコレクションしましたか？最高のコレクターだけがこの究極の目標を達成できます！"
  cardsFinished: "おめでとうございます！すべてのカードをコレクションしました。あなたは史上最高のカードコレクターです！"
kr:
  congratulations: "축하합니다!"
  demoCampaignFinished: "데모 캠페인을 완료했습니다! 게임이 마음에 드셨다면 피드백을 부탁드립니다. 정식 버전이 곧 출시될 예정입니다."
  campaignFinished: "캠페인을 완료했습니다! 축하합니다! 당신은 진정한 카드 전술가입니다! 하지만 모든 카드를 수집하셨나요? 최고의 카드 수집가들만이 이 궁극의 목표를 달성할 수 있습니다!"
  cardsFinished: "축하합니다! 모든 카드를 수집하셨습니다. 당신은 역대 최고의 카드 수집가입니다!"
zh:
  congratulations: "恭喜！"
  demoCampaignFinished: "你已经完成了试玩版战役！如果你喜欢这个游戏，欢迎提供建议。正式版即将发布。"
  campaignFinished: "你已经完成了战役！恭喜！你是一位名副副其实的战术家！但你收集齐所有卡牌了吗？只有最顶尖的收集者才能实现这一终极目标！"
  cardsFinished: "恭喜！你已经收集了每一张卡牌。你是史上最伟大的卡牌收藏家！"
ru:
  congratulations: "Поздравляем!"
  demoCampaignFinished: "Вы завершили демо-кампанию! Если вам понравилась игра, я буду рад конструктивному отзыву. Полная версия скоро выйдет."
  campaignFinished: "Вы завершили кампанию! Поздравляем! Вы достойный тактик! Но собрали ли вы уже все карты? Только лучшие коллекционеры достигают этой конечной цели!"
  cardsFinished: "Поздравляем! Вы собрали все карты. Вы величайший коллекционер карт всех времен!"
</i18n>