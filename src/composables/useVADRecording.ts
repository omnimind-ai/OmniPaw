import { ref } from 'vue'

export function useVADRecording() {
  const isSpeaking = ref(false)
  const audioEnergy = ref(0)
  let stream: MediaStream | null = null

  async function startRecording(
    onSpeechStart?: () => void,
    _onSpeechEnd?: (audio: Float32Array) => void,
  ): Promise<void> {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    isSpeaking.value = false
    audioEnergy.value = 0
    onSpeechStart?.()
  }

  function stopRecording(): void {
    stream?.getTracks().forEach((track) => track.stop())
    stream = null
    isSpeaking.value = false
    audioEnergy.value = 0
  }

  return {
    isSpeaking,
    audioEnergy,
    startRecording,
    stopRecording,
  }
}
