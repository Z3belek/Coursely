"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Course } from "@/types";
import Card from "@/components/Card";

const CoursesPage = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = () => {
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/courses`)
      .then((res) => res.json())
      .then((data: Course[]) => {
        setCourses(data.map(course => ({
          ...course,
          title: course.title || course.courseName,
          imagePath: course.imagePath,
          udemyId: course.udemyId,
        })));
      })
      .catch((err) => console.error("Error al cargar cursos:", err));
  };

  const handleChangeProfile = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('selectedProfile');
    }
    router.push('/profiles');
  };

  const handleSyncCourses = () => {
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/courses/sync`, { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        console.log('Cursos sincronizados:', data);
        fetchCourses();
      })
      .catch((err) => console.error("Error al sincronizar cursos:", err));
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-black p-4">
      <div className="text-center max-w-5xl w-full">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-white tracking-wide">Tus Cursos</h1>
          <div className="flex space-x-4">
            <button
              onClick={handleChangeProfile}
              className="bg-gray-800 text-white cursor-pointer px-4 py-2 rounded-full hover:bg-gray-700 transition-colors duration-300 text-lg font-medium shadow-md hover:shadow-lg"
            >
              Cambiar Perfil
            </button>
            <button
              onClick={handleSyncCourses}
              className="bg-green-600 text-white cursor-pointer px-4 py-2 rounded-full hover:bg-green-700 transition-colors duration-300 text-lg font-medium shadow-md hover:shadow-lg"
            >
              Sincronizar Cursos
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {courses.map((course) => (
            <Card key={course.courseName} params={course} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default CoursesPage;