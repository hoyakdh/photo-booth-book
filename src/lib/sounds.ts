/**
 * Web Audio API로 효과음 생성 (외부 파일 불필요)
 * iOS Safari 대응: 첫 사용자 터치 후 AudioContext 활성화
 */

let audioCtx: AudioContext | null = null;

/**
 * AudioContext를 반환하되, suspended 상태면 resume이 완료될 때까지 기다린다.
 * resume()은 Promise를 반환하므로 await 없이 쓰면 suspended 채로 오디오가
 * 스케줄링되어 무음이 될 수 있다.
 */
async function getAudioContextReady(): Promise<AudioContext> {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
  return audioCtx;
}

/**
 * iOS Safari에서 AudioContext를 활성화하기 위해
 * 사용자 터치/클릭 이벤트에서 한 번 호출
 */
export async function initAudio() {
  try {
    await getAudioContextReady();
  } catch (e) {
    console.warn("[sound] initAudio failed", e);
  }
}

/**
 * 카운트다운 비프음 (짧고 높은 톤)
 */
export async function playBeep() {
  try {
    const ctx = await getAudioContextReady();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.value = 880; // A5
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {
    console.warn("[sound] playBeep failed", e);
  }
}

/**
 * 촬영 셔터음 (카메라 느낌)
 */
export async function playShutter() {
  try {
    const ctx = await getAudioContextReady();

    // 클릭음 (노이즈 버스트)
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 3000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(ctx.currentTime);

    // 두 번째 클릭 (셔터 닫히는 소리)
    const buffer2 = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data2 = buffer2.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data2[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
    }

    const noise2 = ctx.createBufferSource();
    noise2.buffer = buffer2;

    const filter2 = ctx.createBiquadFilter();
    filter2.type = "highpass";
    filter2.frequency.value = 2000;

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.4, ctx.currentTime + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

    noise2.connect(filter2);
    filter2.connect(gain2);
    gain2.connect(ctx.destination);

    noise2.start(ctx.currentTime + 0.06);
  } catch (e) {
    console.warn("[sound] playShutter failed", e);
  }
}

/**
 * 마지막 카운트 (1!) 높은 비프
 */
export async function playFinalBeep() {
  try {
    const ctx = await getAudioContextReady();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.value = 1320; // E6 - 더 높은 톤
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) {
    console.warn("[sound] playFinalBeep failed", e);
  }
}
