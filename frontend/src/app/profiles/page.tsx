"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ProfilesPage = () => {
  const [profiles, setProfiles] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/profiles`)
      .then((res) => res.json())
      .then((data) => setProfiles(data))
      .catch((err) => console.error("Error al cargar perfiles:", err));
  }, []);

  const handleProfileSelect = (profile: string) => {
    if (profile) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('selectedProfile', profile);
      }
      router.push('/courses');
    }
  };

  const handleCreateProfile = () => {
    const profileName = prompt("Ingrese el nombre del nuevo perfil:");
    if (profileName) {
      fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileName }),
      })
        .then((res) => res.json())
        .then(() => {
          setProfiles([...profiles, profileName]);
          handleProfileSelect(profileName);
        })
        .catch((err) => console.error("Error al crear perfil:", err));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-6 tracking-wide">Selecciona tu Perfil</h1>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 max-w-4xl mx-auto px-8">
          {profiles.map((profile) => (
            <div
              key={profile}
              onClick={() => handleProfileSelect(profile)}
              className="cursor-pointer bg-gradient-to-br from-blue-600 to-purple-700 rounded-xl p-6 shadow-2xl hover:shadow-3xl hover:scale-105 transition-all duration-300 transform"
            >
              <div className="w-36 h-36 mx-auto bg-white rounded-full flex items-center justify-center mb-6 border-4 border-gray-200">
                <span className="text-3xl font-bold text-gray-900">{profile.charAt(0).toUpperCase()}</span>
              </div>
              <p className="text-white text-center text-xl font-semibold tracking-tight">{profile}</p>
            </div>
          ))}
          <div
            onClick={handleCreateProfile}
            className="cursor-pointer bg-gradient-to-br from-green-600 to-teal-700 rounded-xl p-6 shadow-2xl hover:shadow-3xl hover:scale-105 transition-all duration-300 flex items-center justify-center"
          >
            <span className="text-white text-center text-xl font-semibold tracking-tight">+ Crear Nuevo Perfil</span>
          </div>
        </div>
        <button
          onClick={() => router.push('/')}
          className="mt-12 bg-gray-800 text-white px-6 py-3 rounded-full hover:bg-gray-700 transition-colors duration-300 text-lg font-medium shadow-md hover:shadow-lg"
        >
          Volver al Inicio
        </button>
      </div>
    </div>
  );
};

export default ProfilesPage;