"use client";
import { Pen } from "@/icons/Pen";
import { Play } from "@/icons/Play";
import { Course } from "@/types";
import React, { useState } from "react";
import Link from "next/link";
import Modal from "./Modal";

const Card = ({ params }: { params: Course }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState(params.title); // Siempre string, ya que title es obligatorio en Course
  const [udemyId, setUdemyId] = useState(params.udemyId || ""); // string | null, pero inicializamos con ""
  const [imageFile, setImageFile] = useState<File | null>(null); // Archivo seleccionado para subir
  const [previewImage, setPreviewImage] = useState<string | null>(params.imagePath ?? null); // Maneja undefined como null

  const openModal = () => setIsModalOpen(true);

  const closeModal = () => {
    // Restaurar valores originales al cerrar sin guardar
    setTitle(params.title);
    setUdemyId(params.udemyId || "");
    setImageFile(null);
    setPreviewImage(params.imagePath ?? null); // Convertir undefined a null
    setIsModalOpen(false);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result as string); // Vista previa de la nueva imagen
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setPreviewImage(null); // Eliminar la imagen en la vista previa
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append("title", title);
    formData.append("udemyId", udemyId || ""); // Enviar vacío si no hay udemyId
    if (imageFile) {
      formData.append("image", imageFile);
    } else if (previewImage === null && params.imagePath) {
      formData.append("image", ""); // Indicar eliminación de la imagen existente
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/courses/${params.courseName}`, {
        method: "PUT",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Error al actualizar curso: ${response.status}`);
      }

      const data = await response.json();
      console.log("Curso actualizado:", data);

      // No actualizamos params directamente aquí porque es una prop inmutable.
      // Si necesitas reflejar los cambios en la UI sin recargar, considera pasar una función desde el padre para actualizar el estado.
      closeModal();
    } catch (err) {
      console.error("Error al guardar cambios:", err);
    }
  };

  return (
    <div
      style={{'--image-url': `url(${params.imagePath})`} as React.CSSProperties} 
      className={`h-52 aspect-video rounded-xl flex flex-col relative overflow-hidden before:content-[''] before:absolute before:size-38 before:-top-12 before:-left-12 before:rounded-full before:border-[35px] before:border-fuchsia-950/30 before:transition-all before:duration-800 before:ease-in-out before:blur-[0.5rem] hover:before:w-[140px] hover:before:h-[140px] hover:before:-top-[30%] hover:before:left-1/2 hover:before:blur-0 ${
        (params.imagePath !== null)
          ? "bg-cover bg-center bg-[image:var(--image-url)]"
          : "bg-gradient-to-br from-blue-600 to-purple-700"
      }`}
    >
      <div className="flex-1 p-3 flex flex-col text-left">
        <h2 className="text-md text-gray-200 font-bold">{params.title}</h2>
        <p className="text-sm text-gray-400 font-light">Vivamus nisi purus</p>
      </div>
      <div className="flex items-center justify-center w-full overflow-hidden">
        <Link
          href={encodeURIComponent(params.courseName)}
          className="w-1/2 h-9 bg-black/30 flex items-center justify-center hover:bg-black/60"
        >
          <Play className="size-5 fill-white" />
        </Link>
        <button
          onClick={openModal}
          className="w-1/2 h-9 bg-black/30 flex items-center justify-center hover:bg-black/60 cursor-pointer"
        >
          <Pen className="size-5 fill-white" />
        </button>
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title="Editar Curso">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Campo para el título */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Título del curso
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              required
            />
          </div>

          {/* Campo para el Udemy ID */}
          <div>
            <label htmlFor="udemyId" className="block text-sm font-medium text-gray-700">
              Udemy ID (opcional)
            </label>
            <input
              type="text"
              id="udemyId"
              value={udemyId}
              onChange={(e) => setUdemyId(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          {/* Campo para la imagen */}
          <div>
            <label className="block text-sm font-medium text-gray-700">Imagen del curso</label>
            {previewImage ? (
              <div className="mt-2">
                <img src={previewImage} alt="Vista previa" className="w-32 h-32 object-cover rounded-md" />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="mt-2 text-sm text-red-600 hover:text-red-800"
                >
                  Borrar imagen
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
            )}
          </div>

          {/* Botones de acción */}
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              Guardar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Card;