"use client";
import { Course, ProgressProps } from "@/types";
import { redirect } from "next/navigation";
import { use, useEffect, useState } from "react";

type Params = { course: string };

const CoursePage = ({ params }: { params: Promise<Params> }) => {
  const [progress, setProgress] = useState<ProgressProps | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const resolvedParams = use(params);
  const courseName = resolvedParams.course;

  useEffect(() => {
    const profile = typeof window !== 'undefined' ? localStorage.getItem('selectedProfile') : null;
    if (profile) {
      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/profiles/${profile}/progress/${courseName}`)
      .then((res) => res.json())
      .then((data) => {
        setProgress({
          section: data.section,
          video: data.video,
          position: data.position,
        });
      })
      .catch((err) => console.error("Error al cargar progreso:", err));
    }
  }, [courseName]);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/courses/${courseName}`)
      .then((res) => res.json())
      .then((data: Course) => {
        setCourse({
          ...data,
          title: data.title || data.courseName,
          imagePath: data.imagePath,
          udemyId: data.udemyId,
          sections: data.sections
        });
      })
      .catch((err) => console.error("Error al cargar curso:", err));
  }
  , [courseName]);

  useEffect(() => {
    if (progress && (progress.section !== "" || null) && (progress.video !== "" || null)) {
      redirect(`/${courseName}/${encodeURIComponent(progress.section)}/${encodeURIComponent(progress.video.replace(".mp4", ""))}`);
    } else if (course) {
      redirect(`/${courseName}/${encodeURIComponent(course.sections[0].sectionName)}/${encodeURIComponent(course.sections[0].videos[0].videoName.replace(".mp4", ""))}`);
    }
  }, [progress, courseName, course]);

  return null;
};

export default CoursePage;