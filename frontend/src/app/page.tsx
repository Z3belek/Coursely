"use client";
import { redirect } from "next/navigation";
import { useEffect } from "react";

const Home = () => {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const profile = localStorage.getItem('selectedProfile');
      console.log('profile', profile);
      if (!profile) {
        redirect('/profiles');
      }
    }
  }, []);

  return null;
};

export default Home;
