"use client";
import { VideoPlayerProps } from "@/types";
import { useRouter } from "next/navigation";
import React, { FC, useCallback, useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";

const VideoPlayer: FC<VideoPlayerProps> = ({ video, section, course, courses, profile }) => {
  const [progress, setProgress] = useState(0);
  const [isEnd, setIsEnd] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showNextButton, setShowNextButton] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [lastSavedProgress, setLastSavedProgress] = useState<{ section: string; video: string; position: number } | null>(null);
  const [hasLoadedProgress, setHasLoadedProgress] = useState(false);
  const playerRef = useRef<ReactPlayer | null>(null);
  const router = useRouter();

  // Cargar progreso inicial
  useEffect(() => {
    if (isReady && !hasLoadedProgress) {
      console.log(`Cargando progreso para ${profile}/${course}`);
      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/profiles/${profile}/progress/${course}`)
        .then((res) => res.json())
        .then((data) => {
          console.log("Progreso recibido:", data);
          if (data.video === video.videoName && data.section === section) {
            const savedPosition = data.position || 0;
            setProgress(savedPosition);
            setLastSavedProgress({ section, video: video.videoName, position: savedPosition });
            if (playerRef.current) {
              playerRef.current.seekTo(savedPosition, "seconds");
            }
          }
          setHasLoadedProgress(true);
        })
        .catch((err) => console.error("Error al cargar progreso:", err));
    }
  }, [isReady, video.videoName, section, course, profile, hasLoadedProgress]);

  // Guardar progreso
  const saveProgress = (newSection: string, newVideo: string, newPosition: number) => {
    console.log(`Intentando guardar progreso: section=${newSection}, video=${newVideo}, position=${newPosition}`);

    // Evitar guardar si no ha cargado el progreso inicial
    if (!hasLoadedProgress) {
      console.log("Progreso no guardado: aún no se ha cargado el progreso inicial.");
      return;
    }

    // Comparar con el último progreso guardado
    if (
      lastSavedProgress &&
      lastSavedProgress.section === newSection &&
      lastSavedProgress.video === newVideo &&
      Math.abs(lastSavedProgress.position - newPosition) < 5
    ) {
      console.log("Progreso no guardado: cambio menor a 5 segundos.");
      return;
    }

    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/profiles/${profile}/progress/${course}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: newSection, video: newVideo, position: newPosition }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        console.log("Respuesta del servidor:", data);
        setLastSavedProgress({ section: newSection, video: newVideo, position: newPosition });
      })
      .catch((err) => console.error("Error al guardar progreso:", err.message));
  };

  const handleProgress = (state: { playedSeconds: number; loadedSeconds: number }) => {
    const newProgress = state.playedSeconds;
    setProgress(newProgress);

    const duration = playerRef.current?.getDuration() || 0;
    const timeLeft = duration - newProgress;
    if (timeLeft <= 30 && timeLeft > 0 && !showNextButton) {
      setShowNextButton(true);
      setCountdown(Math.ceil(timeLeft));
    }

    // Guardar progreso
    if (hasLoadedProgress) {
      console.log(`Progreso actual: ${newProgress}, ultimo guardado: ${lastSavedProgress?.position}`);
      saveProgress(section, video.videoName, newProgress);
    }
  };

  const handleEnded = () => {
    setIsEnd(true);
    setProgress(0);
    goToNextVideo();
    if (hasLoadedProgress) {
      saveProgress(section, video.videoName, 0);
    }
  };

  const handleReady = () => {
    setIsReady(true);
  };

  const goToNextVideo = useCallback(() => {
    const currentCourse = courses.find((c) => c.courseName === course);
    const currentSectionIdx = currentCourse?.sections.findIndex((s) => s.sectionName === section) || 0;
    const currentVideoIdx = currentCourse?.sections[currentSectionIdx].videos.findIndex(
      (v) => v.videoName === video.videoName
    ) || 0;

    let nextSection = currentCourse?.sections[currentSectionIdx];
    let nextVideoIdx = currentVideoIdx + 1;

    if (nextVideoIdx >= (nextSection?.videos.length || 0)) {
      const nextSectionIdx = currentSectionIdx + 1;
      if (nextSectionIdx >= (currentCourse?.sections.length || 0)) {
        return;
      }
      nextSection = currentCourse?.sections[nextSectionIdx];
      nextVideoIdx = 0;
    }

    const nextVideo = nextSection?.videos[nextVideoIdx];
    if (nextVideo && nextSection) {
      router.push(
        `/${encodeURIComponent(course)}/${encodeURIComponent(nextSection.sectionName)}/${encodeURIComponent(
          nextVideo.videoName.replace(".mp4", "")
        )}`
      );
    }
  }, [courses, course, section, video.videoName, router]);

  const videoUrl = `${process.env.NEXT_PUBLIC_BACKEND_URL}/video/${encodeURIComponent(
    course
  )}/${encodeURIComponent(section)}/${encodeURIComponent(video.videoName.replace(".mp4", ""))}`;

  useEffect(() => {
    if (showNextButton && countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    } else if (showNextButton && countdown === 0) {
      goToNextVideo();
    }
  }, [showNextButton, countdown, goToNextVideo]);

  return (
    <div className="space-y-4 w-full relative">
      <ReactPlayer
        ref={playerRef}
        url={videoUrl}
        playing={true}
        controls={true}
        onProgress={handleProgress}
        onEnded={handleEnded}
        onReady={handleReady}
        progressInterval={5000}
        width="100%"
        height="100%"
      />
      <div className="text-white text-sm mt-2">Posición actual: {progress.toFixed(2)} segundos</div>
      {showNextButton && !isEnd && (
        <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 z-10">
          <button
            onClick={goToNextVideo}
            className="bg-blue-500 text-white py-2 px-4 rounded shadow-lg hover:bg-blue-600"
          >
            Siguiente video en {countdown} segundos
          </button>
        </div>
      )}
      {isEnd && (
        <div>
          <button className="bg-blue-500 text-white py-2 px-4 rounded">
            Siguiente video en 3 segundos
          </button>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;