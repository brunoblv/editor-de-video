'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';

const ENVIRONMENTS = [
  { value: 'cabin', label: 'Cabana' },
  { value: 'forest', label: 'Floresta' },
  { value: 'ocean', label: 'Oceano' },
  { value: 'cafe', label: 'Café' },
  { value: 'room', label: 'Quarto' },
  { value: 'city', label: 'Cidade' },
];

const WEATHERS = [
  { value: 'rain', label: 'Chuva' },
  { value: 'heavy_rain', label: 'Chuva forte' },
  { value: 'thunderstorm', label: 'Tempestade' },
  { value: 'clear', label: 'Limpo' },
  { value: 'wind', label: 'Vento' },
];

const TIMES = [
  { value: 'night', label: 'Noite' },
  { value: 'day', label: 'Dia' },
  { value: 'dusk', label: 'Entardecer' },
];

const PURPOSES = [
  { value: 'sleep', label: 'Dormir' },
  { value: 'relax', label: 'Relaxar' },
  { value: 'study', label: 'Estudar' },
  { value: 'immersive', label: 'Imersivo' },
];

const DURATIONS = [30, 60, 120, 180, 480, 600];

const PRESETS = [
  { value: 'RAIN_SLEEP', label: 'Chuva para dormir' },
  { value: 'COZY_FIREPLACE', label: 'Lareira aconchegante' },
  { value: 'THUNDERSTORM', label: 'Tempestade' },
  { value: 'BROWN_NOISE', label: 'Brown noise' },
  { value: 'FOREST_NIGHT', label: 'Floresta à noite' },
  { value: 'OCEAN_SLEEP', label: 'Oceano' },
  { value: 'RAINY_CAFE', label: 'Café chuvoso' },
] as const;

type PresetId = (typeof PRESETS)[number]['value'];

const SOUND_OPTS = [
  { key: 'rain', label: 'Chuva' },
  { key: 'roof_rain', label: 'Chuva no telhado' },
  { key: 'forest', label: 'Floresta' },
  { key: 'ocean', label: 'Oceano' },
  { key: 'fireplace', label: 'Lareira' },
  { key: 'wind', label: 'Vento' },
  { key: 'distant_thunder', label: 'Trovões' },
  { key: 'room_ambience', label: 'Ambiente de sala' },
  { key: 'city_rain', label: 'Chuva na cidade' },
  { key: 'brown_noise', label: 'Brown noise' },
];

const PRESET_DEFAULTS: Record<
  PresetId,
  {
    environment: string;
    weather: string;
    timeOfDay: string;
    purpose: string;
    layers: string[];
  }
> = {
  RAIN_SLEEP: {
    environment: 'cabin',
    weather: 'heavy_rain',
    timeOfDay: 'night',
    purpose: 'sleep',
    layers: ['rain', 'roof_rain', 'wind', 'distant_thunder', 'fireplace'],
  },
  COZY_FIREPLACE: {
    environment: 'cabin',
    weather: 'clear',
    timeOfDay: 'night',
    purpose: 'relax',
    layers: ['fireplace', 'room_ambience', 'wind'],
  },
  THUNDERSTORM: {
    environment: 'cabin',
    weather: 'thunderstorm',
    timeOfDay: 'night',
    purpose: 'immersive',
    layers: ['rain', 'roof_rain', 'wind', 'distant_thunder'],
  },
  BROWN_NOISE: {
    environment: 'room',
    weather: 'clear',
    timeOfDay: 'night',
    purpose: 'sleep',
    layers: ['brown_noise'],
  },
  FOREST_NIGHT: {
    environment: 'forest',
    weather: 'rain',
    timeOfDay: 'night',
    purpose: 'sleep',
    layers: ['forest', 'rain', 'wind', 'distant_thunder'],
  },
  OCEAN_SLEEP: {
    environment: 'ocean',
    weather: 'clear',
    timeOfDay: 'night',
    purpose: 'sleep',
    layers: ['ocean', 'wind'],
  },
  RAINY_CAFE: {
    environment: 'cafe',
    weather: 'rain',
    timeOfDay: 'day',
    purpose: 'study',
    layers: ['rain', 'room_ambience', 'city_rain'],
  },
};

const ENV_PRESET: Record<string, PresetId> = {
  cabin: 'RAIN_SLEEP',
  forest: 'FOREST_NIGHT',
  ocean: 'OCEAN_SLEEP',
  cafe: 'RAINY_CAFE',
  room: 'BROWN_NOISE',
  city: 'RAIN_SLEEP',
};

function layersFromKeys(keys: string[]): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const opt of SOUND_OPTS) next[opt.key] = keys.includes(opt.key);
  return next;
}

function defaultLayersForEnv(environment: string, weather: string): string[] {
  const defaults = PRESET_DEFAULTS[ENV_PRESET[environment] ?? 'RAIN_SLEEP'];
  if (environment === 'forest') {
    const layers = ['forest', 'wind'];
    if (weather !== 'clear') layers.push('rain');
    if (weather.includes('thunder') || weather.includes('heavy')) layers.push('distant_thunder');
    return layers;
  }
  if (environment === 'ocean') return weather.includes('rain') ? ['ocean', 'rain', 'wind'] : ['ocean', 'wind'];
  if (environment === 'cafe') return ['rain', 'room_ambience', 'city_rain'];
  if (environment === 'city') return ['city_rain', 'rain', 'wind'];
  if (environment === 'room') {
    return weather === 'clear' ? ['room_ambience', 'brown_noise'] : ['rain', 'room_ambience', 'wind'];
  }
  return defaults.layers;
}

export function AmbientForm() {
  const router = useRouter();
  const [environment, setEnvironment] = useState('cabin');
  const [weather, setWeather] = useState('heavy_rain');
  const [timeOfDay, setTimeOfDay] = useState('night');
  const [purpose, setPurpose] = useState('sleep');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [preset, setPreset] = useState<PresetId>('RAIN_SLEEP');
  const [format, setFormat] = useState<'youtube' | 'shorts'>('youtube');
  const [layers, setLayers] = useState<Record<string, boolean>>(() =>
    layersFromKeys(PRESET_DEFAULTS.RAIN_SLEEP.layers),
  );
  const [autoConcept, setAutoConcept] = useState(false);
  const [autoSearch, setAutoSearch] = useState(true);
  const [generateThumbnail, setGenerateThumbnail] = useState(true);
  const [generateMetadata, setGenerateMetadata] = useState(true);
  const [qualityCheck, setQualityCheck] = useState(true);
  const [createVariations, setCreateVariations] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const audioLayers = useMemo(
    () => SOUND_OPTS.filter((o) => layers[o.key]).map((o) => o.key),
    [layers],
  );

  function applyPreset(next: PresetId): void {
    const defaults = PRESET_DEFAULTS[next];
    setPreset(next);
    setEnvironment(defaults.environment);
    setWeather(defaults.weather);
    setTimeOfDay(defaults.timeOfDay);
    setPurpose(defaults.purpose);
    setLayers(layersFromKeys(defaults.layers));
  }

  function onEnvironmentChange(next: string): void {
    setEnvironment(next);
    const matched = ENV_PRESET[next];
    if (matched) {
      setPreset(matched);
      const defaults = PRESET_DEFAULTS[matched];
      // Mantém clima/horário escolhidos; só ajusta camadas ao ambiente.
      setLayers(layersFromKeys(defaultLayersForEnv(next, weather)));
      if (next === defaults.environment) {
        setPurpose(defaults.purpose);
      }
    } else {
      setLayers(layersFromKeys(defaultLayersForEnv(next, weather)));
    }
  }

  function onWeatherChange(next: string): void {
    setWeather(next);
    setLayers(layersFromKeys(defaultLayersForEnv(environment, next)));
  }

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/ambient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environment,
          weather,
          timeOfDay,
          purpose,
          durationMinutes,
          preset: autoConcept ? null : preset,
          format,
          audioLayers,
          autoConcept,
          autoSearch,
          generateThumbnail,
          generateMetadata,
          qualityCheck,
          createVariations,
          startPreview: true,
        }),
      });
      const payload = (await response.json()) as { project?: { id: string }; error?: string };
      if (!response.ok || !payload.project) {
        throw new Error(payload.error ?? 'Não foi possível criar o ambiente.');
      }
      router.push(`/projects/${payload.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2>Gerar ambiente</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Soundscape em camadas · preview obrigatório · licenças verificadas
      </p>
      {error ? <div className="error">{error}</div> : null}

      <div className="grid-2">
        <div>
          <label htmlFor="amb-env">Ambiente</label>
          <select
            id="amb-env"
            value={environment}
            disabled={autoConcept}
            onChange={(e) => onEnvironmentChange(e.target.value)}
          >
            {ENVIRONMENTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="amb-weather">Clima</label>
          <select
            id="amb-weather"
            value={weather}
            disabled={autoConcept}
            onChange={(e) => onWeatherChange(e.target.value)}
          >
            {WEATHERS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="amb-time">Horário</label>
          <select
            id="amb-time"
            value={timeOfDay}
            disabled={autoConcept}
            onChange={(e) => setTimeOfDay(e.target.value)}
          >
            {TIMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="amb-purpose">Finalidade</label>
          <select
            id="amb-purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          >
            {PURPOSES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="amb-dur">Duração</label>
          <select
            id="amb-dur"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(Number(e.target.value))}
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d >= 60 ? `${d / 60} hora${d === 60 ? '' : 's'}` : `${d} min`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="amb-format">Formato</label>
          <select
            id="amb-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as 'youtube' | 'shorts')}
          >
            <option value="youtube">YouTube 16:9</option>
            <option value="shorts">Shorts 9:16</option>
          </select>
        </div>
        <div>
          <label htmlFor="amb-preset">Preset</label>
          <select
            id="amb-preset"
            value={preset}
            disabled={autoConcept}
            onChange={(e) => applyPreset(e.target.value as PresetId)}
          >
            {PRESETS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="muted" style={{ marginBottom: 8 }}>
          Camadas sonoras
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
          {SOUND_OPTS.map((opt) => (
            <label key={opt.key} className="row" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={Boolean(layers[opt.key])}
                disabled={autoConcept}
                onChange={(e) =>
                  setLayers((prev) => ({ ...prev, [opt.key]: e.target.checked }))
                }
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div className="row" style={{ marginTop: 16, flexWrap: 'wrap', gap: 12 }}>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={autoConcept}
            onChange={(e) => setAutoConcept(e.target.checked)}
          />
          Escolher conceito automaticamente
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={autoSearch}
            onChange={(e) => setAutoSearch(e.target.checked)}
          />
          Pesquisar assets automaticamente
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={createVariations}
            onChange={(e) => setCreateVariations(e.target.checked)}
          />
          Criar variações
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={generateThumbnail}
            onChange={(e) => setGenerateThumbnail(e.target.checked)}
          />
          Gerar thumbnail
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={generateMetadata}
            onChange={(e) => setGenerateMetadata(e.target.checked)}
          />
          Gerar metadata
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={qualityCheck}
            onChange={(e) => setQualityCheck(e.target.checked)}
          />
          Quality Check
        </label>
      </div>

      <div style={{ marginTop: 20 }}>
        <button className="primary" type="submit" disabled={saving || audioLayers.length === 0}>
          {saving ? 'Criando...' : 'GERAR AMBIENTE'}
        </button>
      </div>
    </form>
  );
}
