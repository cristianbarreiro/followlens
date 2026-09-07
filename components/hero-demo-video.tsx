'use client';

import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import Image from 'next/image';

export type DemoVideo = {
  /** Use a real local file path or a provider's embed URL, without autoplay. */
  src: string;
  kind: 'file' | 'embed';
  poster?: string;
  /** Optional Spanish WebVTT captions for a native video. */
  captionsSrc?: string;
};

export function HeroDemoVideo({ video }: { video?: DemoVideo }) {
  const [requested, setRequested] = useState(false);
  const [failed, setFailed] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const available = Boolean(video?.src);

  useEffect(() => {
    // Playback is requested only after the visitor presses the preview button.
    if (requested && video?.kind === 'file') {
      void player.current?.play().catch(() => {
        // Native controls remain available if the browser blocks playback.
      });
    }
  }, [requested, video?.kind]);

  return (
    <div className="hero-video" aria-label="Demostración de FollowLens">
      {requested && video && !failed ? (
        video.kind === 'embed' ? (
          <iframe
            className="hero-video-player"
            src={video.src}
            title="Demostración de FollowLens"
            allow="fullscreen; picture-in-picture"
            referrerPolicy="no-referrer"
            allowFullScreen
          />
        ) : (
          <video
            ref={player}
            className="hero-video-player"
            src={video.src}
            poster={video.poster}
            controls
            playsInline
            preload="none"
            aria-label="Demostración de FollowLens"
            onError={() => setFailed(true)}
          >
            <track
              kind="captions"
              src={video.captionsSrc}
              srcLang="es"
              label="Español"
              default
            />
          </video>
        )
      ) : (
        <>
          {video?.poster && (
            <Image
              className="hero-video-poster"
              src={video.poster}
              alt=""
              fill
              unoptimized
              sizes="(max-width: 1050px) 100vw, 60vw"
            />
          )}
          <div className="hero-video-preview">
            <span className="hero-video-label">FOLLOWLENS · DEMO</span>
            <button
              type="button"
              className="hero-video-button"
              disabled={!available || failed}
              onClick={() => setRequested(true)}
              aria-describedby="hero-video-status"
              aria-label={
                available
                  ? 'Reproducir demostración'
                  : 'Demostración próximamente'
              }
            >
              <span className="hero-video-play">
                <Play size={24} fill="currentColor" aria-hidden="true" />
              </span>
              <span>Ver demostración</span>
            </button>
            <output id="hero-video-status" className="hero-video-status">
              {failed
                ? 'No se pudo cargar el vídeo.'
                : available
                  ? 'Reproducir vídeo'
                  : 'Próximamente'}
            </output>
          </div>
        </>
      )}
    </div>
  );
}
