import { VideoListProps } from "@/types";
import { useRouter } from "next/navigation";
import React, { FC } from "react";
import { Accordion, AccordionItem } from "./Accordion";

const VideoList: FC<VideoListProps> = ({
  courses,
  currentCourse,
  currentSection,
  currentVideo
}) => {
  const router = useRouter();
  const currentCourseData = courses.find(
    (c) => encodeURIComponent(c.courseName) === currentCourse
  );

  return (
    <Accordion defaultSelectedKeys={[decodeURIComponent(currentSection)]}>
      {currentCourseData?.sections.map((section) => (
        <AccordionItem key={section.sectionName} ariaLabel={section.sectionName} title={section.sectionName} itemKey={section.sectionName}>
          <table className="w-full">
            <tbody>
              {section.videos.map((video) => {
                const isCurrent = encodeURIComponent(section.sectionName) === currentSection && encodeURIComponent(video.videoName.replace(".mp4", "")) === currentVideo;
                return (
                  <tr className={`border-b border-white/10 hover:bg-white/10 w-full cursor-pointer last-of-type:border-b-0 ${isCurrent ? "bg-blue-500/20" : ""}`} key={video.order}>
                    <th scope="row" className="px-6 py-4 font-medium text-white text-left overflow-x-hidden" onClick={() => router.push(`/${encodeURIComponent(currentCourseData.courseName)}/${encodeURIComponent(section.sectionName)}/${encodeURIComponent(video.videoName.replace(".mp4", ""))}`)}>
                      {video.videoName.slice(0, -4)}
                    </th>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AccordionItem>
      ))}
    </Accordion>
  );
};

export default VideoList;