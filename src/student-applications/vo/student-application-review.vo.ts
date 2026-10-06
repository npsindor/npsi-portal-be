import { ApiProperty } from "@nestjs/swagger";
import { StudentVo } from "../../students/vo/students.vo.js";
import { StudentApplicationVo } from "./student-applications.vo.js";

export class StudentApplicationReviewVo {
  @ApiProperty({ type: StudentApplicationVo }) application!: StudentApplicationVo;
  @ApiProperty({ type: StudentVo, nullable: true, description: "The student record created on approval" }) student!: StudentVo | null;
}
