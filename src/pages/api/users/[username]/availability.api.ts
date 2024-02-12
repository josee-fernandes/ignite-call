import { prisma } from '@/lib/prisma'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { NextApiRequest, NextApiResponse } from 'next'

dayjs.extend(utc)

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).end()
  }

  const username = String(req.query.username)
  const { date, timezoneOffset } = req.query

  if (!date || !timezoneOffset) {
    return res.status(400).json({ message: 'Date not provided.' })
  }

  const user = await prisma.user.findUnique({ where: { username } })

  if (!user) {
    return res.status(400).json({ message: 'User does not exist.' })
  }

  const referenceDate = dayjs(String(date))
  const isPastDate = referenceDate.endOf('day').isBefore(new Date())

  const timezoneOffsetInHours = Number(String(timezoneOffset)) / 60

  const referenceDateTimeZoneOffsetInHours =
    referenceDate.toDate().getTimezoneOffset() / 60

  if (isPastDate) {
    return res.json({ possibleTimes: [], availability: [] })
  }

  const userAvailability = await prisma.userTimeInterval.findFirst({
    where: {
      user_id: user.id,
      week_day: referenceDate.get('day'),
    },
  })

  if (!userAvailability) {
    return res.json({ possibleTimes: [], availability: [] })
  }

  const { time_start_in_minutes, time_end_in_minutes } = userAvailability

  const startHour = time_start_in_minutes / 60
  const endHour = time_end_in_minutes / 60

  const possibleTimes = Array.from({ length: endHour - startHour }).map(
    (_, index) => startHour + index,
  )

  const blockedTimes = await prisma.scheduling.findMany({
    select: {
      date: true,
    },
    where: {
      user_id: user.id,
      date: {
        // greater than or equal
        gte: referenceDate
          .set('hour', startHour)
          .add(timezoneOffsetInHours, 'hours')
          .toDate(),
        // less than or equal
        lte: referenceDate
          .set('hour', endHour)
          .add(timezoneOffsetInHours, 'hours')
          .toDate(),
      },
    },
  })

  const availableTimes = possibleTimes.filter((time) => {
    const isTimeBlocked = blockedTimes.some(
      (blockedTime) =>
        blockedTime.date.getUTCHours() - timezoneOffsetInHours === time,
    )

    const isTimeInPast = referenceDate
      .set('hour', time)
      .subtract(referenceDateTimeZoneOffsetInHours, 'hours')
      .isBefore(dayjs().utc().subtract(timezoneOffsetInHours, 'hours'))

    return !isTimeBlocked && !isTimeInPast
  })

  return res.json({ possibleTimes, availableTimes })
}
