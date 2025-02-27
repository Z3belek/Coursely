"use client";
import { use, useEffect, useState } from "react";
import VideoPlayerWrapper from "@/components/VideoPlayerWrapper";
import VideoList from "@/components/VideoList";
import { Course } from "@/types";
import Link from "next/link";

type Params = { course: string; section: string; video: string };

const VideoPage = ({ params }: { params: Promise<Params> }) => {
  const resolvedParams = use(params);
  const { course, section, video } = resolvedParams;

  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/courses`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: Course[]) => setCourses(data));
  }, [course]);

  const currentCourse = courses.find((c) => encodeURIComponent(c.courseName) === course);
  const currentSection = currentCourse?.sections.find((s) => encodeURIComponent(s.sectionName) === section);
  const currentVideo = currentSection?.videos.find(
    (v) => encodeURIComponent(v.videoName.replace(".mp4", "")) === video
  );

  if (!currentCourse || !currentSection || !currentVideo) {
    return <div className="min-h-screen flex items-center justify-center bg-black">Video no encontrado</div>;
  }

  const profile = typeof window !== 'undefined' ? localStorage.getItem('selectedProfile') || 'Perfil1' : 'Perfil1';

  return (
    <div className="min-h-screen bg-black p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <Link href="/courses"
            className="bg-gray-800 text-white px-4 py-2 rounded-full hover:bg-gray-700 transition-colors duration-300 text-lg font-medium shadow-md hover:shadow-lg"
          >
            Volver a Cursos
          </Link>
          <h1 className="text-3xl font-bold text-white tracking-wide">Reproductor de Cursos</h1>
          <div className="w-16"></div>
        </div>
        <div className="w-full flex flex-col space-y-4 lg:flex-row lg:space-x-4">
          <div className="w-full lg:w-3/4">
            <VideoPlayerWrapper
              video={currentVideo}
              section={currentSection.sectionName}
              course={currentCourse.courseName}
              courses={courses}
              profile={profile}
            />
          </div>
          <div className="px-4 lg:w-1/4">
            <VideoList courses={courses} currentCourse={course} currentSection={section} currentVideo={video}/>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPage;