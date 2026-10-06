import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import { createWithDisplayId } from "../common/utils/display-ids.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { CreateStudentDto, StudentListQueryDto, UpdateStudentDto } from "./dto/students.dto.js";
import { StudentsRepository } from "./students.repository.js";
import { type StudentVo, toStudentVo } from "./vo/students.vo.js";

@Injectable()
export class StudentsService {
  constructor(private readonly repo: StudentsRepository) {}

  async list(query: StudentListQueryDto): Promise<StudentVo[]> {
    const where: Prisma.StudentWhereInput = {};
    const rows = await this.repo.list(where, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT);
    return rows.map(toStudentVo);
  }

  async create(dto: CreateStudentDto): Promise<StudentVo> {
    const row = await createWithDisplayId(
      "NPSI-STU-",
      (prefix) => this.repo.latestDisplayIds(prefix),
      (studentId) => this.repo.create({ id: randomId(), studentId, ...toCreateData(dto) }),
    );
    return toStudentVo(row);
  }

  async update(id: string, dto: UpdateStudentDto): Promise<StudentVo> {
    const row = await this.repo.update(id, toUpdateData(dto));
    if (!row) throw new ApiError(404, "Record not found");
    return toStudentVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}

// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
const toCreateData = (input: CreateStudentDto): Omit<Prisma.StudentUncheckedCreateInput, "id" | "studentId"> => ({
  studentName: input.studentName,
  status: input.status,
  mobile: input.mobile,
  email: input.email,
  dob: parseDate(input.dob),
  gender: input.gender,
  course: input.course,
  institution: input.institution,
  academicYear: input.academicYear,
  guardianName: input.guardianName,
  guardianMobile: input.guardianMobile,
  address: input.address,
  city: input.city,
  district: input.district,
  state: input.state,
  pincode: input.pincode,
  photoUrl: input.photoUrl,
  registrationDate: parseDate(input.registrationDate),
  applicationId: input.applicationId,
  linkedFamilyId: input.linkedFamilyId,
  linkedMembershipId: input.linkedMembershipId,
  fatherName: input.fatherName,
});

const toUpdateData = (input: UpdateStudentDto): Prisma.StudentUncheckedUpdateInput => ({
  studentName: input.studentName,
  status: input.status,
  mobile: input.mobile,
  email: input.email,
  dob: parseDate(input.dob),
  gender: input.gender,
  course: input.course,
  institution: input.institution,
  academicYear: input.academicYear,
  guardianName: input.guardianName,
  guardianMobile: input.guardianMobile,
  address: input.address,
  city: input.city,
  district: input.district,
  state: input.state,
  pincode: input.pincode,
  photoUrl: input.photoUrl,
  registrationDate: parseDate(input.registrationDate),
  applicationId: input.applicationId,
  linkedFamilyId: input.linkedFamilyId,
  linkedMembershipId: input.linkedMembershipId,
  fatherName: input.fatherName,
  updatedAt: new Date(),
});
