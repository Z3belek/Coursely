"use client";
import dynamic from "next/dynamic";
import { VideoPlayerProps } from "../types";
import { Suspense } from "react";

const VideoPlayer = dynamic(() => import("./VideoPlayer"), {
  ssr: false,
});

const VideoPlayerWrapper: React.FC<VideoPlayerProps> = ({ video, section, course, courses, profile, initialPosition }) => {
  return (
    <Suspense fallback={<div>Cargando reproductor...</div>}>
      <VideoPlayer video={video} section={section} course={course} courses={courses} profile={profile} initialPosition={initialPosition} />
    </Suspense>
  );
};

export default VideoPlayerWrapper;