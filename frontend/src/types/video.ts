export type Video = {
  videoName: string;
  order: string;
  url: string;
};

export type Section = {
  sectionName: string;
  videos: Video[];
};

export type Course = {
  courseName: string;
  title: string;
  imagePath?: string | null | undefined;
  udemyId?: string | null | undefined;
  sections: Section[];
};

export type ProgressProps = {
  section: string;
  video: string;
  position: number;
};

export type VideoPlayerProps = {
  video: Video;
  section: string;
  course: string;
  courses: Course[];
  profile: string;
  initialPosition?: number;
};

export type VideoListProps = {
  courses: Course[];
  currentCourse: string;
  currentSection: string;
  currentVideo: string;
};

export type ProgressData = {
  course: string;
  section: string;
  video: string;
  position: number;
};