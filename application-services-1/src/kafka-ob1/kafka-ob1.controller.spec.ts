import { Test, TestingModule } from '@nestjs/testing';
import { KafkaOb1Controller } from './kafka-ob1.controller';

describe('KafkaOb1Controller', () => {
  let controller: KafkaOb1Controller;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KafkaOb1Controller],
    }).compile();

    controller = module.get<KafkaOb1Controller>(KafkaOb1Controller);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
