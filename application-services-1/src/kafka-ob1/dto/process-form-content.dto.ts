// In dto/process-form-content.dto.ts
export class ProcessFormContentDto {
    @IsNotEmpty()
    messageContent: { formContent: any };
  
    @IsNotEmpty()
    projectName: string;
  
    @IsNotEmpty()
    instanceName: string;
  }
  